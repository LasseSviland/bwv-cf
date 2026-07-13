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
  JsonObject,
  JsonValue,
  MonopolyDetail,
  MonopolyInventoryEntry,
  MonopolyInventoryResponse,
  MonopolySummary,
  MonopolyCatalogItem,
  Month,
  Period,
  StatusResponse,
  WineInventoryEntry,
  WineInventoryResponse,
  WineDetail,
  WineSummary,
  WineCatalogItem,
} from "@bwv/contracts";
