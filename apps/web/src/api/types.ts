/**
 * Frontend-facing type barrel. The API client owns runtime validation; UI code
 * imports the corresponding inferred contract types from here.
 */
export type {
  AdminAcceptedResponse,
  CatalogResponse,
  AvailabilitySummary,
  DailyInventory,
  Freshness,
  ISODate,
  MonopolyInventoryEntry,
  MonopolyInventoryResponse,
  MonopolySummary,
  MonopolyCatalogItem,
  Month,
  Period,
  StatusResponse,
  WineInventoryEntry,
  WineInventoryResponse,
  WineSummary,
  WineCatalogItem,
} from "@bwv/contracts";
