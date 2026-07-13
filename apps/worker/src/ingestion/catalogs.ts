import {
  MonopolyDetailSchema,
  MonopolySummarySchema,
  WineDetailSchema,
  WineSummarySchema,
  type MonopolyDetail,
  type MonopolySummary,
  type WineDetail,
  type WineSummary,
} from "@bwv/contracts";

import { PermanentQueueError } from "../errors";
import { MONOPOLIES_KEY, WINES_KEY } from "../storage/keys";
import {
  getOptionalJson,
  getRequiredJson,
  parseMonopolyCatalogFile,
  parseWineCatalogFile,
  putJson,
} from "../storage/r2";
import type { JsonObject, JsonValue, MonopolyCatalogFile, WineCatalogFile } from "../types";
import {
  BETTER_WINES_WHOLESALER,
  fetchAllBetterWines,
  fetchAllMonopolies,
  nestedArray,
  nestedString,
  wineProductId,
  type FetchFunction,
} from "./vinmonopolet";

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMergeJsonObjects(previous: JsonObject, current: JsonObject): JsonObject {
  const merged: JsonObject = { ...previous };
  for (const [key, currentValue] of Object.entries(current)) {
    const previousValue = merged[key];
    merged[key] =
      previousValue !== undefined && isJsonObject(previousValue) && isJsonObject(currentValue)
        ? deepMergeJsonObjects(previousValue, currentValue)
        : currentValue;
  }
  return merged;
}

export function mergeWines(
  previousWines: readonly JsonObject[],
  currentWines: readonly JsonObject[],
): JsonObject[] {
  const byProductId = new Map<string, JsonObject>();
  for (const wine of previousWines) byProductId.set(wineProductId(wine), wine);
  for (const wine of currentWines) {
    const productId = wineProductId(wine);
    const previous = byProductId.get(productId);
    byProductId.set(
      productId,
      previous === undefined ? wine : deepMergeJsonObjects(previous, wine),
    );
  }
  return [...byProductId.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
    .map(([, wine]) => wine);
}

function monopolyStoreId(monopoly: JsonObject): string {
  const storeId = nestedString(monopoly, "storeId");
  if (storeId === null) throw new PermanentQueueError("Vinmonopolet store is missing storeId");
  return storeId;
}

export function mergeMonopolies(
  previousMonopolies: readonly JsonObject[],
  currentMonopolies: readonly JsonObject[],
): JsonObject[] {
  const byStoreId = new Map<string, JsonObject>();
  for (const monopoly of previousMonopolies) byStoreId.set(monopolyStoreId(monopoly), monopoly);
  for (const monopoly of currentMonopolies) {
    const storeId = monopolyStoreId(monopoly);
    const previous = byStoreId.get(storeId);
    byStoreId.set(
      storeId,
      previous === undefined ? monopoly : deepMergeJsonObjects(previous, monopoly),
    );
  }
  return [...byStoreId.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
    .map(([, monopoly]) => monopoly);
}

function numericId(value: string, context: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new PermanentQueueError(`${context} is not numeric`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new PermanentQueueError(`${context} is too large`);
  return parsed;
}

const ASSORTMENT_GRADE_PATTERN = /^(?:SB)?[1-6][LR]?$/i;

function assortmentGradesFromSource(wine: JsonObject): string[] {
  const grades = nestedArray(wine, "assortment", "assortmentGrades").flatMap((value) => {
    if (!isJsonObject(value)) return [];
    const grade = nestedString(value, "assortmentGrade");
    return grade === null ? [] : [grade.toUpperCase()];
  });
  if (grades.length > 0) return [...new Set(grades)];

  // The migration catalog kept the legacy category in one of these fields.
  // Retain that fallback until every stored catalog has been refreshed from Vinmonopolet.
  const legacyCategory =
    nestedString(wine, "legacyDatabase", "butikkategori") ??
    nestedString(wine, "classification", "productTypeName");
  return legacyCategory !== null && ASSORTMENT_GRADE_PATTERN.test(legacyCategory)
    ? [legacyCategory.toUpperCase()]
    : [];
}

export function wineSummaryFromSource(wine: JsonObject): WineSummary {
  const productNumber = wineProductId(wine);
  const name =
    nestedString(wine, "basic", "productLongName") ??
    nestedString(wine, "basic", "productShortName");
  if (name === null) throw new PermanentQueueError(`Wine ${productNumber} is missing its name`);
  const assortmentGrades = assortmentGradesFromSource(wine);
  return WineSummarySchema.parse({
    id: numericId(productNumber, `Wine productId ${productNumber}`),
    productNumber,
    name,
    country: nestedString(wine, "origins", "origin", "country"),
    wineCategory: assortmentGrades.length > 0 ? assortmentGrades.join(", ") : null,
    assortment:
      nestedString(wine, "assortment", "assortment") ??
      nestedString(wine, "legacyDatabase", "produktutvalg"),
    assortmentGrades,
  });
}

export function monopolySummaryFromSource(monopoly: JsonObject): MonopolySummary {
  const storeNumber = nestedString(monopoly, "storeId");
  const name = nestedString(monopoly, "storeName");
  if (storeNumber === null || name === null) {
    throw new PermanentQueueError("Vinmonopolet store is missing storeId or storeName");
  }
  return MonopolySummarySchema.parse({
    id: numericId(storeNumber, `Store id ${storeNumber}`),
    storeNumber,
    name,
    postalCode: nestedString(monopoly, "address", "postalCode"),
    city: nestedString(monopoly, "address", "city"),
    monopolyCategory: nestedString(monopoly, "category"),
    monopolyProfile: nestedString(monopoly, "profile"),
    storeAssortment: nestedString(monopoly, "storeAssortment"),
  });
}

export function wineDetailFromSource(wine: JsonObject): WineDetail {
  return WineDetailSchema.parse({
    ...wineSummaryFromSource(wine),
    sourceData: wine,
  });
}

export function monopolyDetailFromSource(monopoly: JsonObject): MonopolyDetail {
  return MonopolyDetailSchema.parse({
    ...monopolySummaryFromSource(monopoly),
    sourceData: monopoly,
  });
}

export async function syncMonopolies(
  env: Env,
  syncedAt: string,
  fetchFn: FetchFunction = fetch,
): Promise<MonopolyCatalogFile> {
  const current = await fetchAllMonopolies(env.VINMONOPOLET_OPEN_API_KEY, fetchFn);
  if (current.length === 0) throw new Error("Vinmonopolet returned no stores");
  const previous = await getOptionalJson(env.DATA_BUCKET, MONOPOLIES_KEY, parseMonopolyCatalogFile);
  const file: MonopolyCatalogFile = {
    schemaVersion: 1,
    syncedAt,
    source: "vinmonopolet/stores/v0/details",
    monopolies: mergeMonopolies(previous?.monopolies ?? [], current),
  };
  await putJson(env.DATA_BUCKET, MONOPOLIES_KEY, file);
  return file;
}

export async function syncWines(
  env: Env,
  syncedAt: string,
  fetchFn: FetchFunction = fetch,
): Promise<WineCatalogFile> {
  const current = await fetchAllBetterWines(env.VINMONOPOLET_RESTRICTED_API_KEY, fetchFn);
  if (current.length === 0) {
    throw new Error(`Vinmonopolet returned no wines for ${BETTER_WINES_WHOLESALER}`);
  }
  const previous = await getOptionalJson(env.DATA_BUCKET, WINES_KEY, parseWineCatalogFile);
  const file: WineCatalogFile = {
    schemaVersion: 1,
    syncedAt,
    source: "vinmonopolet/my-products/v1/details-normal",
    wholesaler: BETTER_WINES_WHOLESALER,
    wines: mergeWines(previous?.wines ?? [], current),
  };
  await putJson(env.DATA_BUCKET, WINES_KEY, file);
  return file;
}

export function getRawWineCatalog(env: Env): Promise<WineCatalogFile> {
  return getRequiredJson(env.DATA_BUCKET, WINES_KEY, parseWineCatalogFile);
}

export function getRawMonopolyCatalog(env: Env): Promise<MonopolyCatalogFile> {
  return getRequiredJson(env.DATA_BUCKET, MONOPOLIES_KEY, parseMonopolyCatalogFile);
}

export async function getWineCatalog(env: Env): Promise<WineSummary[]> {
  const file = await getRawWineCatalog(env);
  return file.wines.map(wineSummaryFromSource);
}

export async function getMonopolyCatalog(env: Env): Promise<MonopolySummary[]> {
  const file = await getRawMonopolyCatalog(env);
  return file.monopolies.map(monopolySummaryFromSource);
}

export async function getWineDetail(env: Env, wineId: number): Promise<WineDetail | null> {
  const file = await getRawWineCatalog(env);
  const wine = file.wines.find(
    (candidate) => numericId(wineProductId(candidate), "Wine product id") === wineId,
  );
  return wine === undefined ? null : wineDetailFromSource(wine);
}

export async function getMonopolyDetail(
  env: Env,
  monopolyId: number,
): Promise<MonopolyDetail | null> {
  const file = await getRawMonopolyCatalog(env);
  const monopoly = file.monopolies.find(
    (candidate) => numericId(monopolyStoreId(candidate), "Store id") === monopolyId,
  );
  return monopoly === undefined ? null : monopolyDetailFromSource(monopoly);
}
