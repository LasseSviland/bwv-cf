import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  BETTER_WINES_WHOLESALER,
  INVENTORY_SOURCE,
  MANIFEST_FILE,
  MONOPOLIES_KEY,
  MONOPOLY_SOURCE,
  WINES_KEY,
  WINE_SOURCE,
} from "./constants.mjs";
import { LruNdjsonWriters, readNdjson } from "./ndjson.mjs";
import {
  cleanCategory,
  fileMetadata,
  identifierString,
  nonnegativeInteger,
  optionalString,
  positiveInteger,
  readJson,
  sha256File,
  writeCompactJson,
  writeJsonAtomic,
} from "./util.mjs";

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function sourceDateToIso(value) {
  const source = String(value);
  const iso = /^\d{8}$/.test(source)
    ? `${source.slice(0, 4)}-${source.slice(4, 6)}-${source.slice(6, 8)}`
    : source;
  if (!validIsoDate(iso)) throw new Error(`Invalid source inventory date ${source}`);
  return iso;
}

function compareIdentifiers(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

export function wineFromLegacyRow(row) {
  if (row.grossist !== BETTER_WINES_WHOLESALER) {
    throw new Error(`Legacy wine ${String(row.id)} does not belong to Better Wines`);
  }
  const productId = identifierString(row.varenummer, `Wine ${String(row.id)} varenummer`);
  const name = optionalString(row.varenavn);
  if (name === null) throw new Error(`Wine ${productId} is missing varenavn`);
  const country = optionalString(row.land);
  const category = cleanCategory(row.butikkategori, "Butikkategori");
  const wine = {
    basic: { productId, productLongName: name },
    logistics: { wholesalerName: BETTER_WINES_WHOLESALER },
    migration: { source: "legacy-mysql", legacyId: positiveInteger(row.id, "Wine id") },
    legacyDatabase: row,
  };
  if (country !== null) wine.origins = { origin: { country } };
  if (category !== null) wine.classification = { productTypeName: category };
  return wine;
}

export function monopolyFromLegacyRow(row) {
  const storeId = identifierString(row.butikk_id, `Monopoly ${String(row.id)} butikk_id`);
  const storeName = optionalString(row.butikknavn);
  if (storeName === null) throw new Error(`Monopoly ${storeId} is missing butikknavn`);
  const postalCode = optionalString(row.__postalCode ?? row.gate_postnummer);
  const city = optionalString(row.__city ?? row.gate_poststed);
  const category = cleanCategory(row.kategori, "Kategori");
  const monopoly = {
    storeId,
    storeName,
    migration: { source: "legacy-mysql", legacyId: positiveInteger(row.id, "Monopoly id") },
    legacyDatabase: Object.fromEntries(
      Object.entries(row).filter(([key]) => !key.startsWith("__")),
    ),
  };
  if (postalCode !== null || city !== null) {
    monopoly.address = {};
    if (postalCode !== null) monopoly.address.postalCode = postalCode;
    if (city !== null) monopoly.address.city = city;
  }
  if (category !== null) monopoly.category = category;
  return monopoly;
}

function productIdFromWine(wine) {
  return identifierString(wine?.basic?.productId, "Wine basic.productId");
}

function storeIdFromMonopoly(monopoly) {
  return identifierString(monopoly?.storeId, "Monopoly storeId");
}

function belongsToBetterWines(wine) {
  return wine?.logistics?.wholesalerName === BETTER_WINES_WHOLESALER;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(previous, current) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(current)) {
    merged[key] =
      isPlainObject(merged[key]) && isPlainObject(value) ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

function mergeRecords(historic, current, keyOf) {
  const records = new Map();
  for (const record of historic) records.set(keyOf(record), record);
  for (const record of current) {
    const key = keyOf(record);
    const previous = records.get(key);
    records.set(key, previous === undefined ? record : deepMerge(previous, record));
  }
  return [...records.entries()]
    .sort(([left], [right]) => compareIdentifiers(left, right))
    .map(([, record]) => record);
}

export function mergeWineCatalogs(historic, current, syncedAt) {
  if (
    historic.schemaVersion !== 1 ||
    historic.source !== WINE_SOURCE ||
    historic.wholesaler !== BETTER_WINES_WHOLESALER ||
    !Array.isArray(historic.wines)
  ) {
    throw new Error("The prepared historic wine catalog is invalid");
  }
  if (
    current !== null &&
    (current.schemaVersion !== 1 ||
      current.source !== WINE_SOURCE ||
      current.wholesaler !== BETTER_WINES_WHOLESALER ||
      !Array.isArray(current.wines))
  ) {
    throw new Error("The remote wine catalog is invalid");
  }
  const wines = mergeRecords(historic.wines, current?.wines ?? [], productIdFromWine).filter(
    belongsToBetterWines,
  );
  if (wines.length === 0) throw new Error("The merged Better Wines catalog is empty");
  return {
    schemaVersion: 1,
    syncedAt,
    source: WINE_SOURCE,
    wholesaler: BETTER_WINES_WHOLESALER,
    wines,
  };
}

export function mergeMonopolyCatalogs(historic, current, syncedAt) {
  if (
    historic.schemaVersion !== 1 ||
    historic.source !== MONOPOLY_SOURCE ||
    !Array.isArray(historic.monopolies)
  ) {
    throw new Error("The prepared historic monopoly catalog is invalid");
  }
  if (
    current !== null &&
    (current.schemaVersion !== 1 ||
      current.source !== MONOPOLY_SOURCE ||
      !Array.isArray(current.monopolies))
  ) {
    throw new Error("The remote monopoly catalog is invalid");
  }
  const monopolies = mergeRecords(
    historic.monopolies,
    current?.monopolies ?? [],
    storeIdFromMonopoly,
  );
  if (monopolies.length === 0) throw new Error("The merged monopoly catalog is empty");
  return { schemaVersion: 1, syncedAt, source: MONOPOLY_SOURCE, monopolies };
}

async function prepareCatalogs(root, syncedAt) {
  const wineByProduct = new Map();
  for await (const row of readNdjson(join(root, "raw", "wines.ndjson"))) {
    const wine = wineFromLegacyRow(row);
    wineByProduct.set(productIdFromWine(wine), wine);
  }
  const wines = [...wineByProduct.entries()]
    .sort(([left], [right]) => compareIdentifiers(left, right))
    .map(([, wine]) => wine);
  if (wines.length === 0) throw new Error("The Better Wines export is empty");

  const monopolyByStore = new Map();
  for await (const row of readNdjson(join(root, "raw", "monopolies.ndjson"))) {
    const monopoly = monopolyFromLegacyRow(row);
    monopolyByStore.set(storeIdFromMonopoly(monopoly), monopoly);
  }
  const monopolies = [...monopolyByStore.entries()]
    .sort(([left], [right]) => compareIdentifiers(left, right))
    .map(([, monopoly]) => monopoly);
  if (monopolies.length === 0) throw new Error("The monopoly export is empty");

  await writeCompactJson(join(root, "cloudflare", WINES_KEY), {
    schemaVersion: 1,
    syncedAt,
    source: WINE_SOURCE,
    wholesaler: BETTER_WINES_WHOLESALER,
    wines,
  });
  await writeCompactJson(join(root, "cloudflare", MONOPOLIES_KEY), {
    schemaVersion: 1,
    syncedAt,
    source: MONOPOLY_SOURCE,
    monopolies,
  });
  return { wines: wines.length, monopolies: monopolies.length };
}

async function partitionInventory(root) {
  const spoolRoot = join(root, "spool", "inventory");
  const writers = new LruNdjsonWriters();
  const dates = new Set();
  let rows = 0;
  try {
    for await (const row of readNdjson(join(root, "raw", "inventories.ndjson"))) {
      const date = sourceDateToIso(row.date);
      const normalized = {
        id: positiveInteger(row.id, "Inventory id"),
        count: nonnegativeInteger(row.count, `Inventory ${String(row.id)} count`),
        productId: identifierString(
          row.__productNumber,
          `Inventory ${String(row.id)} product number`,
        ),
        storeId: identifierString(row.__storeNumber, `Inventory ${String(row.id)} store number`),
      };
      await writers.append(join(spoolRoot, `${date}.ndjson`), normalized);
      dates.add(date);
      rows += 1;
    }
  } finally {
    await writers.close();
  }
  return { dates: [...dates].sort(), rows };
}

async function finalizeInventoryDate(root, date, syncedAt) {
  const latest = new Map();
  for await (const row of readNdjson(join(root, "spool", "inventory", `${date}.ndjson`))) {
    const key = `${row.productId}\u0000${row.storeId}`;
    const current = latest.get(key);
    if (current === undefined || row.id > current.id) latest.set(key, row);
  }

  const byProduct = new Map();
  let positiveObservations = 0;
  for (const row of latest.values()) {
    if (row.count === 0) continue;
    const stock = byProduct.get(row.productId) ?? [];
    stock.push({ storeId: row.storeId, storeStock: row.count });
    byProduct.set(row.productId, stock);
    positiveObservations += 1;
  }
  const products = [...byProduct.entries()]
    .sort(([left], [right]) => compareIdentifiers(left, right))
    .map(([productId, stock]) => ({
      productId,
      stock: stock.sort((left, right) => compareIdentifiers(left.storeId, right.storeId)),
    }));
  const key = `inventory/${date}.json`;
  await writeCompactJson(join(root, "cloudflare", key), {
    schemaVersion: 1,
    syncedAt,
    date,
    source: INVENTORY_SOURCE,
    products,
  });
  return { key, positiveObservations };
}

export async function prepareSnapshot(root, state, syncedAt = new Date().toISOString()) {
  await rm(join(root, "cloudflare"), { recursive: true, force: true });
  await rm(join(root, "spool"), { recursive: true, force: true });
  await mkdir(join(root, "cloudflare"), { recursive: true });

  const catalogs = await prepareCatalogs(root, syncedAt);
  const partition = await partitionInventory(root);
  const inventory = [];
  let positiveObservations = 0;
  for (const date of partition.dates) {
    const result = await finalizeInventoryDate(root, date, syncedAt);
    inventory.push(result.key);
    positiveObservations += result.positiveObservations;
  }
  await rm(join(root, "spool"), { recursive: true, force: true });

  const keys = [WINES_KEY, MONOPOLIES_KEY, ...inventory];
  const objects = [];
  for (const key of keys) {
    objects.push(await fileMetadata(join(root, "cloudflare", key), key, root));
  }
  const manifest = {
    schemaVersion: 1,
    status: "ready",
    createdAt: state.startedAt,
    preparedAt: syncedAt,
    source: {
      inventoryCeilingId: state.inventoryCeilingId,
      filter: `wines.grossist = ${BETTER_WINES_WHOLESALER}`,
      rawRows: {
        wines: state.wineRows,
        monopolies: state.monopolyRows,
        inventories: partition.rows,
      },
    },
    cloudflare: {
      wines: catalogs.wines,
      monopolies: catalogs.monopolies,
      inventoryFiles: inventory.length,
      positiveInventoryObservations: positiveObservations,
      objects,
    },
  };
  await writeJsonAtomic(join(root, MANIFEST_FILE), manifest);
  return manifest;
}

export async function validateSnapshot(root) {
  const manifest = await readJson(join(root, MANIFEST_FILE));
  if (manifest.schemaVersion !== 1 || manifest.status !== "ready") {
    throw new Error("Migration manifest is not ready");
  }
  for (const object of manifest.cloudflare.objects) {
    const path = resolve(root, object.path);
    const actual = await sha256File(path);
    if (actual !== object.sha256) throw new Error(`Checksum mismatch for ${object.key}`);
    const parsed = await readJson(path);
    if (object.key === WINES_KEY) mergeWineCatalogs(parsed, null, parsed.syncedAt);
    if (object.key === MONOPOLIES_KEY) mergeMonopolyCatalogs(parsed, null, parsed.syncedAt);
    if (object.key.startsWith("inventory/")) {
      const expectedDate = object.key.slice("inventory/".length, -".json".length);
      if (
        parsed.schemaVersion !== 1 ||
        parsed.source !== INVENTORY_SOURCE ||
        parsed.date !== expectedDate ||
        !Array.isArray(parsed.products)
      ) {
        throw new Error(`Prepared inventory file ${object.key} is invalid`);
      }
    }
  }
  return manifest;
}
