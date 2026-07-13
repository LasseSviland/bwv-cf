export const MONOPOLIES_KEY = "catalogs/monopolies.json";
export const WINES_KEY = "catalogs/wines.json";
export const INVENTORY_PREFIX = "inventory/";

export function dailyInventoryKey(date: string): string {
  return `${INVENTORY_PREFIX}${date}.json`;
}

export function dateFromDailyInventoryKey(key: string): string | null {
  if (!key.startsWith(INVENTORY_PREFIX) || !key.endsWith(".json")) return null;
  const date = key.slice(INVENTORY_PREFIX.length, -".json".length);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
