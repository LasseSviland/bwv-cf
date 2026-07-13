import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  DEFAULT_R2_BUCKET,
  INVENTORY_PREFIX,
  MONOPOLIES_KEY,
  UPLOAD_REPORT_FILE,
  WINES_KEY,
} from "./constants.mjs";
import { mergeMonopolyCatalogs, mergeWineCatalogs, validateSnapshot } from "./format.mjs";
import {
  mapConcurrent,
  nonnegativeInteger,
  readJson,
  requiredString,
  writeCompactJson,
  writeJsonAtomic,
} from "./util.mjs";

const REPOSITORY_ROOT = resolve(new URL("../../", import.meta.url).pathname);
const WRANGLER_CONFIG = join(REPOSITORY_ROOT, "wrangler.jsonc");

async function runWrangler(arguments_) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["exec", "wrangler", "--config", WRANGLER_CONFIG, ...arguments_], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let standardError = "";
    child.stdout.resume();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      standardError += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `Wrangler exited with code ${String(code)}: ${standardError.trim() || "unknown error"}`,
          ),
        );
      }
    });
  });
}

async function downloadRemoteJson(root, bucket, key) {
  const path = join(root, "remote", key);
  await mkdir(dirname(path), { recursive: true });
  await rm(path, { force: true });
  await runWrangler(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--file", path]);
  return JSON.parse(await readFile(path, "utf8"));
}

async function existingInventoryKeys(environment) {
  const statusUrl = requiredString(environment.MIGRATION_STATUS_URL, "MIGRATION_STATUS_URL");
  const apiKey = requiredString(environment.MIGRATION_API_KEY, "MIGRATION_API_KEY");
  const response = await fetch(statusUrl, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Migration status request failed with HTTP ${String(response.status)}`);
  }
  const status = await response.json();
  const dates = status?.freshness?.availableDates ?? [];
  if (!Array.isArray(dates))
    throw new Error("Migration status response has invalid availableDates");
  return new Set(dates.map((date) => `${INVENTORY_PREFIX}${String(date)}.json`));
}

async function prepareMergedCatalogs(root, bucket) {
  const [currentWines, currentMonopolies, historicWines, historicMonopolies] = await Promise.all([
    downloadRemoteJson(root, bucket, WINES_KEY),
    downloadRemoteJson(root, bucket, MONOPOLIES_KEY),
    readJson(join(root, "cloudflare", WINES_KEY)),
    readJson(join(root, "cloudflare", MONOPOLIES_KEY)),
  ]);
  const mergedAt = new Date().toISOString();
  const wines = mergeWineCatalogs(historicWines, currentWines, mergedAt);
  const monopolies = mergeMonopolyCatalogs(historicMonopolies, currentMonopolies, mergedAt);
  const uploadRoot = join(root, "upload");
  await mkdir(join(uploadRoot, "catalogs"), { recursive: true });
  await writeCompactJson(join(uploadRoot, WINES_KEY), wines);
  await writeCompactJson(join(uploadRoot, MONOPOLIES_KEY), monopolies);
  return { wines: wines.wines.length, monopolies: monopolies.monopolies.length };
}

async function putObject(bucket, key, path) {
  await runWrangler([
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--remote",
    "--force",
    "--file",
    path,
    "--content-type",
    "application/json; charset=utf-8",
    "--cache-control",
    "no-store",
  ]);
}

export async function uploadSnapshotWithWrangler({
  root,
  confirm = false,
  dryRun = false,
  overwriteInventory = false,
  concurrency = 16,
  environment = process.env,
}) {
  if (!dryRun && !confirm) {
    throw new Error("Refusing to upload without --confirm; use --dry-run to inspect the plan");
  }
  nonnegativeInteger(concurrency, "Upload concurrency");
  if (concurrency < 1 || concurrency > 64) {
    throw new Error("Upload concurrency must be between 1 and 64");
  }

  const manifest = await validateSnapshot(root);
  const bucket = environment.MIGRATION_R2_BUCKET ?? DEFAULT_R2_BUCKET;
  const existingInventory = await existingInventoryKeys(environment);
  const inventoryObjects = manifest.cloudflare.objects.filter(({ key }) =>
    key.startsWith(INVENTORY_PREFIX),
  );
  const candidates = inventoryObjects.filter(
    ({ key }) => overwriteInventory || !existingInventory.has(key),
  );
  let catalogCounts;

  if (!dryRun) {
    await mapConcurrent(candidates, concurrency, ({ key, path }) =>
      putObject(bucket, key, resolve(root, path)),
    );
    // Refresh the remote catalogs immediately before merging and committing them.
    catalogCounts = await prepareMergedCatalogs(root, bucket);
    await putObject(bucket, WINES_KEY, join(root, "upload", WINES_KEY));
    await putObject(bucket, MONOPOLIES_KEY, join(root, "upload", MONOPOLIES_KEY));
  } else {
    catalogCounts = await prepareMergedCatalogs(root, bucket);
  }

  const report = {
    schemaVersion: 1,
    status: dryRun ? "dry-run" : "completed",
    completedAt: new Date().toISOString(),
    transport: "wrangler-oauth",
    bucket,
    catalogs: { ...catalogCounts, uploaded: !dryRun },
    inventory: {
      prepared: inventoryObjects.length,
      planned: candidates.length,
      uploaded: dryRun ? 0 : candidates.length,
      skippedExisting: inventoryObjects.length - candidates.length,
      overwriteExisting: overwriteInventory,
    },
  };
  await writeJsonAtomic(join(root, UPLOAD_REPORT_FILE), report);
  return report;
}
