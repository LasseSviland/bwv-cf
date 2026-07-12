/**
 * Frontend-facing type barrel. The API client owns runtime validation; UI code
 * imports the corresponding inferred contract types from here.
 */
export type {
  CatalogResponse,
  DailyInventory,
  Freshness,
  ISODate,
  MonopolyInventoryEntry,
  MonopolyInventoryResponse,
  MonopolySummary,
  Month,
  Period,
  StatusResponse,
  WineInventoryEntry,
  WineInventoryResponse,
  WineSummary,
} from "@bwv/contracts";
