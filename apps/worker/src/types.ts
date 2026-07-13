export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface MonopolyCatalogFile {
  schemaVersion: 1;
  syncedAt: string;
  source: "vinmonopolet/stores/v0/details";
  monopolies: JsonObject[];
}

export interface WineCatalogFile {
  schemaVersion: 2;
  syncedAt: string;
  source: "vinmonopolet/my-products/v1/details-normal";
  wholesaler: "Better Wines AS";
  wines: JsonObject[];
  /** First Oslo date on which each retained product was absent from My Products. */
  outdatedProducts: Record<string, string>;
}

export interface DailyInventoryFile {
  schemaVersion: 1;
  syncedAt: string;
  date: string;
  source: "vinmonopolet/my-products/v1/stock-per-store";
  products: JsonObject[];
}

export interface CompletedInventoryDate {
  date: string;
  etag: string;
  uploaded: Date;
}

export interface QueueProcessResult {
  outcome: "completed" | "skipped";
  detail: string;
}
