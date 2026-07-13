import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, rename, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BETTER_WINES_WHOLESALER,
  DOWNLOAD_STATE_FILE,
  INVENTORY_EXPORT_SQL,
  MONOPOLY_EXPORT_SQL,
  WINE_EXPORT_SQL,
} from "./constants.mjs";
import {
  closeSourceDatabase,
  inventoryCeiling,
  openSourceDatabase,
  streamQuery,
} from "./database.mjs";
import { prepareSnapshot, validateSnapshot } from "./format.mjs";
import { closeWritable, writeLine } from "./ndjson.mjs";
import { positiveInteger, readJson, writeJsonAtomic } from "./util.mjs";

const CHECKPOINT_ROWS = 50_000;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function exportQuery(connection, sql, parameters, path) {
  const temporary = `${path}.tmp`;
  const output = createWriteStream(temporary, { encoding: "utf8", flags: "w", mode: 0o600 });
  let rows = 0;
  try {
    for await (const row of streamQuery(connection, sql, parameters)) {
      await writeLine(output, row);
      rows += 1;
    }
    await closeWritable(output);
    await rename(temporary, path);
    return rows;
  } catch (error) {
    output.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
}

async function checkpoint(root, state) {
  await writeJsonAtomic(join(root, DOWNLOAD_STATE_FILE), state);
}

async function exportInventories(connection, root, state, onProgress) {
  const path = join(root, "raw", "inventories.ndjson");
  if (!(await pathExists(path))) await writeFile(path, "", { encoding: "utf8", mode: 0o600 });
  await truncate(path, state.inventoryBytes);
  let output = createWriteStream(path, { encoding: "utf8", flags: "a", mode: 0o600 });
  let rows = state.inventoryRows;
  let bytes = state.inventoryBytes;
  let lastId = state.inventoryLastId;
  let rowsSinceCheckpoint = 0;

  try {
    for await (const row of streamQuery(connection, INVENTORY_EXPORT_SQL, [
      state.inventoryLastId,
      state.inventoryCeilingId,
      BETTER_WINES_WHOLESALER,
    ])) {
      const id = positiveInteger(row.id, "Inventory id");
      if (id <= lastId)
        throw new Error(`Inventory rows are not ordered after id ${String(lastId)}`);
      bytes += await writeLine(output, row);
      lastId = id;
      rows += 1;
      rowsSinceCheckpoint += 1;

      if (rowsSinceCheckpoint >= CHECKPOINT_ROWS) {
        await closeWritable(output);
        state.inventoryLastId = lastId;
        state.inventoryRows = rows;
        state.inventoryBytes = bytes;
        await checkpoint(root, state);
        onProgress?.({ rows, lastId, ceilingId: state.inventoryCeilingId });
        output = createWriteStream(path, { encoding: "utf8", flags: "a", mode: 0o600 });
        rowsSinceCheckpoint = 0;
      }
    }
    await closeWritable(output);
  } catch (error) {
    output.destroy();
    throw error;
  }

  state.inventoryLastId = state.inventoryCeilingId;
  state.inventoryRows = rows;
  state.inventoryBytes = bytes;
  state.status = "raw-downloaded";
  await checkpoint(root, state);
}

async function initialize(root, force) {
  if (await pathExists(root)) {
    const contents = await readdir(root);
    if (contents.length > 0 && !force) {
      throw new Error(
        `Migration output already exists at ${root}; use --resume or --force explicitly`,
      );
    }
    if (force) await rm(root, { recursive: true, force: true });
  }
  await mkdir(join(root, "raw"), { recursive: true });
  return {
    schemaVersion: 1,
    status: "downloading",
    startedAt: new Date().toISOString(),
    inventoryCeilingId: 0,
    wineRows: 0,
    monopolyRows: 0,
    inventoryLastId: 0,
    inventoryRows: 0,
    inventoryBytes: 0,
  };
}

export async function downloadAndPrepare({
  root,
  resume = false,
  force = false,
  onProgress,
  environment = process.env,
}) {
  if (resume && force) throw new Error("--resume and --force cannot be used together");
  let state;
  if (resume) {
    state = await readJson(join(root, DOWNLOAD_STATE_FILE));
    if (state.schemaVersion !== 1) throw new Error("Unsupported download checkpoint");
    if (state.status === "ready") return validateSnapshot(root);
  } else {
    state = await initialize(root, force);
    await checkpoint(root, state);
  }

  if (state.status === "downloading") {
    const connection = await openSourceDatabase(environment);
    try {
      if (state.inventoryCeilingId === 0) {
        state.inventoryCeilingId = await inventoryCeiling(connection);
        await checkpoint(root, state);
      }
      if (state.wineRows === 0) {
        state.wineRows = await exportQuery(
          connection,
          WINE_EXPORT_SQL,
          [BETTER_WINES_WHOLESALER],
          join(root, "raw", "wines.ndjson"),
        );
        if (state.wineRows === 0) throw new Error("No Better Wines rows were returned by MySQL");
        await checkpoint(root, state);
      }
      if (state.monopolyRows === 0) {
        state.monopolyRows = await exportQuery(
          connection,
          MONOPOLY_EXPORT_SQL,
          [],
          join(root, "raw", "monopolies.ndjson"),
        );
        if (state.monopolyRows === 0) throw new Error("No monopoly rows were returned by MySQL");
        await checkpoint(root, state);
      }
      await exportInventories(connection, root, state, onProgress);
    } finally {
      await closeSourceDatabase(connection);
    }
  }

  const manifest = await prepareSnapshot(root, state);
  state.status = "ready";
  state.preparedAt = manifest.preparedAt;
  await checkpoint(root, state);
  return manifest;
}
