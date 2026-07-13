import { DateStringSchema } from "@bwv/contracts";

import { HttpError, PermanentQueueError } from "../errors";
import type {
  CompletedInventoryDate,
  DailyInventoryFile,
  JsonObject,
  MonopolyCatalogFile,
  WineCatalogFile,
} from "../types";
import { INVENTORY_PREFIX, dateFromDailyInventoryKey } from "./keys";

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
  bucket: R2Bucket,
  key: string,
  value: object | readonly unknown[],
): Promise<R2Object> {
  return bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });
}

export async function putJsonIfAbsent(
  bucket: R2Bucket,
  key: string,
  value: object | readonly unknown[],
): Promise<boolean> {
  const object = await bucket.put(key, JSON.stringify(value), {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });
  return object !== null;
}

export async function getOptionalJson<T>(
  bucket: R2Bucket,
  key: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const object = await bucket.get(key);
  return object === null ? null : parse(await object.json<unknown>());
}

export async function getRequiredJson<T>(
  bucket: R2Bucket,
  key: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const value = await getOptionalJson(bucket, key, parse);
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
