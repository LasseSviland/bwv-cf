import type { RowDataPacket } from "mysql2";

import type {
  DailyInventory,
  MonopolySummary,
  SyncQueueMessage,
  WineSummary,
} from "@bwv/contracts";

export interface InventorySourceRow extends RowDataPacket {
  id: number;
  date: number;
  count: number;
  wineId: number;
  monopolyId: number;
}

export interface SourceBoundRow extends RowDataPacket {
  monthKey: number;
  floorId: number | null;
  ceilingId: number | null;
  sourceRowCount: number;
}

export interface ScalarIdRow extends RowDataPacket {
  id: number | null;
}

export interface WineSourceRow extends RowDataPacket {
  id: number;
  productNumber: string;
  name: string;
  country: string | null;
}

export interface MonopolySourceRow extends RowDataPacket {
  id: number;
  storeNumber: string;
  name: string;
  postalCode: string | null;
  city: string | null;
}

export interface RawInventoryChunk {
  schemaVersion: 1;
  month: string;
  generation: string;
  cursorFrom: number;
  cursorThrough: number;
  rows: InventorySourceRowData[];
}

export interface InventorySourceRowData {
  id: number;
  date: number;
  count: number;
  wineId: number;
  monopolyId: number;
}

export interface MonthlyWineProjection {
  schemaVersion: 1;
  month: string;
  wineId: number;
  monopolies: Array<{
    monopolyId: number;
    inventory: DailyInventory[];
  }>;
}

export interface MonthlyMonopolyProjection {
  schemaVersion: 1;
  month: string;
  monopolyId: number;
  wines: Array<{
    wineId: number;
    inventory: DailyInventory[];
  }>;
}

export interface MonthManifest {
  schemaVersion: 1;
  month: string;
  generation: string;
  generatedAt: string;
  coveredFrom: string;
  coveredThrough: string;
  sourceFloorId: number;
  sourceWatermark: number;
  sourceRowCount: number;
  wineObjectCount: number;
  monopolyObjectCount: number;
}

export interface PublishedMonthRow {
  month: string;
  generation: string;
  manifestKey: string;
  generatedAt: string;
  coveredFrom: string;
  coveredThrough: string;
  sourceFloorId: number;
  sourceWatermark: number;
  sourceRowCount: number;
  wineObjectCount: number;
  monopolyObjectCount: number;
  etag: string;
  publishedAt: string;
}

export interface MonthSyncRow {
  jobId: string;
  month: string;
  generation: string;
  status: string;
  phase: string;
  cursorId: number | null;
  floorId: number | null;
  ceilingId: number | null;
  rowsScanned: number;
  rowsKept: number;
  wineObjectCount: number;
  monopolyObjectCount: number;
  coveredFrom: string | null;
  coveredThrough: string | null;
  sourceWatermark: number | null;
  manifestKey: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SyncRunRow {
  id: string;
  trigger: SyncQueueMessage["trigger"];
  status: string;
  fromMonth: string;
  throughMonth: string;
  totalMonths: number;
  succeededMonths: number;
  failedMonths: number;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface CatalogVersionRow {
  catalog: "wines" | "monopolies";
  generation: string;
  objectKey: string;
  itemCount: number;
  etag: string;
  generatedAt: string;
}

export interface CatalogData {
  wines: WineSummary[];
  monopolies: MonopolySummary[];
}

export interface QueueProcessResult {
  message: SyncQueueMessage;
  outcome: "completed" | "duplicate" | "skipped";
}
