import { z } from "zod";

import { DateStringSchema } from "@bwv/contracts";

import { PermanentQueueError } from "../errors";
import type {
  DailyInventorySnapshot,
  DailyInventorySnapshotRow,
  InventorySourceRowData,
  RawInventoryChunk,
} from "../types";
import { sourceDateToIso } from "./source-date";

const RawInventoryChunkSchema = z.object({
  schemaVersion: z.literal(1),
  month: z.string(),
  generation: z.string(),
  cursorFrom: z.number().int().nonnegative(),
  cursorThrough: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      id: z.number().int().positive(),
      date: z.number().int().positive(),
      count: z.number().int().nonnegative(),
      wineId: z.number().int().positive(),
      monopolyId: z.number().int().positive(),
    }),
  ),
});

export const DailyInventorySnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    date: DateStringSchema,
    generation: z.string().min(1),
    inventory: z.array(
      z
        .object({
          wineId: z.number().int().positive(),
          monopolyId: z.number().int().positive(),
          count: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export function parseRawInventoryChunk(value: unknown): RawInventoryChunk {
  return RawInventoryChunkSchema.parse(value);
}

interface LatestObservation {
  count: number;
  id: number;
  wineId: number;
  monopolyId: number;
}

function observationKey(row: Pick<InventorySourceRowData, "wineId" | "monopolyId">): string {
  return `${row.wineId}:${row.monopolyId}`;
}

function addRows(
  observations: Map<string, LatestObservation>,
  rows: readonly InventorySourceRowData[],
  date: string,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): void {
  for (const row of rows) {
    if (sourceDateToIso(row.date) !== date) continue;
    if (!validWineIds.has(row.wineId)) continue;
    if (!validMonopolyIds.has(row.monopolyId)) {
      throw new PermanentQueueError(`Orphan inventory monopoly_id ${row.monopolyId}`);
    }
    const key = observationKey(row);
    const existing = observations.get(key);
    if (existing === undefined || row.id > existing.id) observations.set(key, row);
  }
}

function finishSnapshot(
  observations: ReadonlyMap<string, LatestObservation>,
  date: string,
  generation: string,
): DailyInventorySnapshot {
  const inventory: DailyInventorySnapshotRow[] = [...observations.values()]
    .filter(({ count }) => count > 0)
    .sort((left, right) => left.wineId - right.wineId || left.monopolyId - right.monopolyId)
    .map(({ wineId, monopolyId, count }) => ({ wineId, monopolyId, count }));
  return { schemaVersion: 2, date, generation, inventory };
}

export function buildDailyInventorySnapshot(
  chunks: readonly RawInventoryChunk[],
  date: string,
  generation: string,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): DailyInventorySnapshot {
  const observations = new Map<string, LatestObservation>();
  for (const chunk of chunks) {
    addRows(observations, chunk.rows, date, validWineIds, validMonopolyIds);
  }
  return finishSnapshot(observations, date, generation);
}

export async function buildDailyInventorySnapshotFromChunks(
  chunks: AsyncIterable<RawInventoryChunk>,
  date: string,
  generation: string,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): Promise<DailyInventorySnapshot> {
  const observations = new Map<string, LatestObservation>();
  for await (const chunk of chunks) {
    addRows(observations, chunk.rows, date, validWineIds, validMonopolyIds);
  }
  return finishSnapshot(observations, date, generation);
}
