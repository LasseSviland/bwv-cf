import { PermanentQueueError } from "../errors";
import type { JsonObject, JsonValue } from "../types";
import { parseJsonObjectArray } from "../storage/r2";

const API_BASE_URL = "https://apis.vinmonopolet.no";
const REQUEST_TIMEOUT_MS = 60_000;

export const BETTER_WINES_WHOLESALER = "Better Wines AS";

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function nestedValue(value: JsonObject, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function nestedString(value: JsonObject, ...path: string[]): string | null {
  const candidate = nestedValue(value, path);
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

export function nestedNumber(value: JsonObject, ...path: string[]): number | null {
  const candidate = nestedValue(value, path);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

export function nestedArray(value: JsonObject, ...path: string[]): JsonValue[] {
  const candidate = nestedValue(value, path);
  return Array.isArray(candidate) ? candidate : [];
}

export function wineProductId(wine: JsonObject): string {
  const productId = nestedString(wine, "basic", "productId");
  if (productId === null)
    throw new PermanentQueueError("Vinmonopolet wine is missing basic.productId");
  return productId;
}

function isPermanentHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function fetchJsonArray(
  url: URL,
  apiKey: string,
  context: string,
  fetchFn: FetchFunction,
): Promise<JsonObject[]> {
  const response = await fetchFn(url, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const message = `${context} failed with HTTP ${response.status}`;
    if (isPermanentHttpStatus(response.status)) throw new PermanentQueueError(message);
    throw new Error(message);
  }
  return parseJsonObjectArray(await response.json<unknown>(), context);
}

export function belongsToBetterWines(wine: JsonObject): boolean {
  return nestedString(wine, "logistics", "wholesalerName") === BETTER_WINES_WHOLESALER;
}

export async function fetchAllMonopolies(
  apiKey: string,
  fetchFn: FetchFunction = fetch,
): Promise<JsonObject[]> {
  return fetchJsonArray(
    new URL("/stores/v0/details", API_BASE_URL),
    apiKey,
    "Vinmonopolet store details",
    fetchFn,
  );
}

export async function fetchAllBetterWines(
  apiKey: string,
  fetchFn: FetchFunction = fetch,
): Promise<JsonObject[]> {
  const wines = await fetchJsonArray(
    new URL("/my-products/v1/details-normal", API_BASE_URL),
    apiKey,
    "Vinmonopolet product details",
    fetchFn,
  );
  return wines.filter(belongsToBetterWines);
}

export async function fetchAllWineInventory(
  apiKey: string,
  fetchFn: FetchFunction = fetch,
): Promise<JsonObject[]> {
  return fetchJsonArray(
    new URL("/my-products/v1/stock-per-store", API_BASE_URL),
    apiKey,
    "Vinmonopolet inventory",
    fetchFn,
  );
}
