import { DateStringSchema } from "@bwv/contracts";

import { HttpError, PermanentQueueError } from "../errors";
import { logError } from "../log";
import type {
  CompletedInventoryDate,
  DailyInventoryFile,
  JsonObject,
  MonopolyCatalogFile,
  WineCatalogFile,
} from "../types";
import { INVENTORY_PREFIX, dateFromDailyInventoryKey } from "./keys";

export const KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;

export type R2JsonStorage = Pick<Env, "DATA_BUCKET" | "R2_CACHE">;

const CACHE_KEY_PREFIX = "r2:";
const MAX_KV_KEY_BYTES = 512;

async function cacheKey(r2Key: string): Promise<string> {
  const direct = `${CACHE_KEY_PREFIX}${r2Key}`;
  if (new TextEncoder().encode(direct).byteLength <= MAX_KV_KEY_BYTES) return direct;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(r2Key));
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${CACHE_KEY_PREFIX}sha256:${hash}`;
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

async function readCache(cache: KVNamespace, r2Key: string): Promise<string | null> {
  const key = await cacheKey(r2Key);
  try {
    return await cache.get(key, "text");
  } catch (error) {
    logError("R2 cache read failed; falling back to R2", {
      r2Key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeCache(cache: KVNamespace, r2Key: string, value: string): Promise<void> {
  if (new TextEncoder().encode(value).byteLength > KV_MAX_VALUE_BYTES) return;
  try {
    await cache.put(await cacheKey(r2Key), value);
  } catch (error) {
    logError("R2 cache write failed; continuing without cache", {
      r2Key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteCache(cache: KVNamespace, r2Key: string): Promise<void> {
  try {
    await cache.delete(await cacheKey(r2Key));
  } catch (error) {
    logError("Invalid R2 cache entry could not be deleted", {
      r2Key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(value: unknown, context: string): JsonObject {
  if (!isObject(value)) throw new PermanentQueueError(`${context} must be a JSON object`);
  return value as JsonObject;
}

export function parseJsonObjectArray(value: unknown, context: string): JsonObject[] {
  if (!Array.isArray(value)) throw new PermanentQueueError(`${context} must be a JSON array`);
  return value.map((entry, index) => parseJsonObject(entry, `${context}[${index}]`));
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PermanentQueueError(`${context} must be a non-empty string`);
  }
  return value;
}

export function parseMonopolyCatalogFile(value: unknown): MonopolyCatalogFile {
  const file = parseJsonObject(value, "Monopoly catalog");
  if (file.schemaVersion !== 1 || file.source !== "vinmonopolet/stores/v0/details") {
    throw new PermanentQueueError("Monopoly catalog schema is not supported");
  }
  return {
    schemaVersion: 1,
    syncedAt: requiredString(file.syncedAt, "Monopoly catalog syncedAt"),
    source: "vinmonopolet/stores/v0/details",
    monopolies: parseJsonObjectArray(file.monopolies, "Monopoly catalog monopolies"),
  };
}

export function parseWineCatalogFile(value: unknown): WineCatalogFile {
  const file = parseJsonObject(value, "Wine catalog");
  if (
    (file.schemaVersion !== 1 && file.schemaVersion !== 2) ||
    file.source !== "vinmonopolet/my-products/v1/details-normal" ||
    file.wholesaler !== "Better Wines AS"
  ) {
    throw new PermanentQueueError("Wine catalog schema is not supported");
  }
  const outdatedProducts: Record<string, string> = {};
  if (file.schemaVersion === 2) {
    if (!isObject(file.outdatedProducts)) {
      throw new PermanentQueueError("Wine catalog outdatedProducts must be a JSON object");
    }
    for (const [productId, value] of Object.entries(file.outdatedProducts)) {
      const parsed = DateStringSchema.safeParse(value);
      if (!parsed.success) {
        throw new PermanentQueueError(
          `Wine catalog outdatedProducts.${productId} must be a valid date`,
        );
      }
      outdatedProducts[productId] = parsed.data;
    }
  }
  return {
    schemaVersion: 2,
    syncedAt: requiredString(file.syncedAt, "Wine catalog syncedAt"),
    source: "vinmonopolet/my-products/v1/details-normal",
    wholesaler: "Better Wines AS",
    wines: parseJsonObjectArray(file.wines, "Wine catalog wines"),
    outdatedProducts,
  };
}

export function parseDailyInventoryFile(value: unknown): DailyInventoryFile {
  const file = parseJsonObject(value, "Daily inventory");
  if (file.schemaVersion !== 1 || file.source !== "vinmonopolet/my-products/v1/stock-per-store") {
    throw new PermanentQueueError("Daily inventory schema is not supported");
  }
  return {
    schemaVersion: 1,
    syncedAt: requiredString(file.syncedAt, "Daily inventory syncedAt"),
    date: requiredString(file.date, "Daily inventory date"),
    source: "vinmonopolet/my-products/v1/stock-per-store",
    products: parseJsonObjectArray(file.products, "Daily inventory products"),
  };
}

export async function putJson(
  storage: R2JsonStorage,
  key: string,
  value: object | readonly unknown[],
): Promise<R2Object> {
  const serialized = JSON.stringify(value);
  const object = await storage.DATA_BUCKET.put(key, serialized, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });
  await writeCache(storage.R2_CACHE, key, serialized);
  return object;
}

export async function putJsonIfAbsent(
  storage: R2JsonStorage,
  key: string,
  value: object | readonly unknown[],
): Promise<boolean> {
  const serialized = JSON.stringify(value);
  const object = await storage.DATA_BUCKET.put(key, serialized, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });
  if (object === null) return false;
  await writeCache(storage.R2_CACHE, key, serialized);
  return true;
}

export async function getOptionalJson<T>(
  storage: R2JsonStorage,
  key: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const cached = await readCache(storage.R2_CACHE, key);
  if (cached !== null) {
    try {
      return parse(parseJson(cached));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      logError("Invalid JSON in R2 cache; refreshing from R2", {
        r2Key: key,
        error: error.message,
      });
      await deleteCache(storage.R2_CACHE, key);
    }
  }

  const object = await storage.DATA_BUCKET.get(key);
  if (object === null) return null;

  if (object.size > KV_MAX_VALUE_BYTES) return parse(await object.json<unknown>());

  const serialized = await object.text();
  const value = parseJson(serialized);
  await writeCache(storage.R2_CACHE, key, serialized);
  return parse(value);
}

export async function objectExists(storage: R2JsonStorage, key: string): Promise<boolean> {
  if ((await readCache(storage.R2_CACHE, key)) !== null) return true;

  const object = await storage.DATA_BUCKET.get(key);
  if (object === null) return false;
  if (object.size <= KV_MAX_VALUE_BYTES) {
    await writeCache(storage.R2_CACHE, key, await object.text());
  }
  return true;
}

export async function getRequiredJson<T>(
  storage: R2JsonStorage,
  key: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const value = await getOptionalJson(storage, key, parse);
  if (value === null) throw new HttpError(503, "dataset_unavailable", "Dataset is unavailable");
  return value;
}

export async function listCompletedInventoryDates(
  bucket: R2Bucket,
): Promise<CompletedInventoryDate[]> {
  const completed: CompletedInventoryDate[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list(
      cursor === undefined
        ? { prefix: INVENTORY_PREFIX, limit: 1_000 }
        : { prefix: INVENTORY_PREFIX, cursor, limit: 1_000 },
    );
    for (const object of page.objects) {
      const date = dateFromDailyInventoryKey(object.key);
      if (date !== null) completed.push({ date, etag: object.etag, uploaded: object.uploaded });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return completed.sort((left, right) => left.date.localeCompare(right.date));
}
