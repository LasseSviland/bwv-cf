import { z } from "zod";

import { PermanentQueueError } from "../errors";
import type {
  InventorySourceRowData,
  MonthlyMonopolyProjection,
  MonthlyWineProjection,
  RawInventoryChunk,
} from "../types";
import { sourceDateToIso } from "./source-date";

export const PROJECTION_BUCKET_COUNT = 16;

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

export function parseRawInventoryChunk(value: unknown): RawInventoryChunk {
  return RawInventoryChunkSchema.parse(value);
}

export function projectionBucket(entityId: number): number {
  return entityId % PROJECTION_BUCKET_COUNT;
}

interface LatestObservation {
  count: number;
  id: number;
}

type ObservationMap = Map<number, Map<number, Map<string, LatestObservation>>>;

function accumulate(
  target: ObservationMap,
  rows: InventorySourceRowData[],
  primary: "wine" | "monopoly",
  bucket: number,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): void {
  for (const row of rows) {
    if (!validWineIds.has(row.wineId)) {
      throw new PermanentQueueError(`Orphan inventory wine_id ${row.wineId}`);
    }
    if (!validMonopolyIds.has(row.monopolyId)) {
      throw new PermanentQueueError(`Orphan inventory monopoly_id ${row.monopolyId}`);
    }
    const primaryId = primary === "wine" ? row.wineId : row.monopolyId;
    if (projectionBucket(primaryId) !== bucket) continue;
    const relatedId = primary === "wine" ? row.monopolyId : row.wineId;
    const date = sourceDateToIso(row.date);

    let related = target.get(primaryId);
    if (related === undefined) {
      related = new Map();
      target.set(primaryId, related);
    }
    let observations = related.get(relatedId);
    if (observations === undefined) {
      observations = new Map();
      related.set(relatedId, observations);
    }
    const existing = observations.get(date);
    if (existing === undefined || row.id > existing.id) {
      observations.set(date, { id: row.id, count: row.count });
    }
  }
}

export function buildWineProjections(
  chunks: RawInventoryChunk[],
  month: string,
  bucket: number,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): MonthlyWineProjection[] {
  const values: ObservationMap = new Map();
  for (const chunk of chunks) {
    accumulate(values, chunk.rows, "wine", bucket, validWineIds, validMonopolyIds);
  }

  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([wineId, related]) => ({
      schemaVersion: 1 as const,
      month,
      wineId,
      monopolies: [...related.entries()]
        .sort(([left], [right]) => left - right)
        .map(([monopolyId, observations]) => ({
          monopolyId,
          inventory: [...observations.entries()]
            .filter(([, observation]) => observation.count > 0)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, observation]) => ({ date, count: observation.count })),
        }))
        .filter(({ inventory }) => inventory.length > 0),
    }))
    .filter(({ monopolies }) => monopolies.length > 0);
}

export async function buildWineProjectionsFromChunks(
  chunks: AsyncIterable<RawInventoryChunk>,
  month: string,
  bucket: number,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): Promise<MonthlyWineProjection[]> {
  const values: ObservationMap = new Map();
  for await (const chunk of chunks) {
    accumulate(values, chunk.rows, "wine", bucket, validWineIds, validMonopolyIds);
  }
  return finishWineProjections(values, month);
}

export function buildMonopolyProjections(
  chunks: RawInventoryChunk[],
  month: string,
  bucket: number,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): MonthlyMonopolyProjection[] {
  const values: ObservationMap = new Map();
  for (const chunk of chunks) {
    accumulate(values, chunk.rows, "monopoly", bucket, validWineIds, validMonopolyIds);
  }

  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([monopolyId, related]) => ({
      schemaVersion: 1 as const,
      month,
      monopolyId,
      wines: [...related.entries()]
        .sort(([left], [right]) => left - right)
        .map(([wineId, observations]) => ({
          wineId,
          inventory: [...observations.entries()]
            .filter(([, observation]) => observation.count > 0)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, observation]) => ({ date, count: observation.count })),
        }))
        .filter(({ inventory }) => inventory.length > 0),
    }))
    .filter(({ wines }) => wines.length > 0);
}

export async function buildMonopolyProjectionsFromChunks(
  chunks: AsyncIterable<RawInventoryChunk>,
  month: string,
  bucket: number,
  validWineIds: ReadonlySet<number>,
  validMonopolyIds: ReadonlySet<number>,
): Promise<MonthlyMonopolyProjection[]> {
  const values: ObservationMap = new Map();
  for await (const chunk of chunks) {
    accumulate(values, chunk.rows, "monopoly", bucket, validWineIds, validMonopolyIds);
  }
  return finishMonopolyProjections(values, month);
}

function finishWineProjections(values: ObservationMap, month: string): MonthlyWineProjection[] {
  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([wineId, related]) => ({
      schemaVersion: 1 as const,
      month,
      wineId,
      monopolies: [...related.entries()]
        .sort(([left], [right]) => left - right)
        .map(([monopolyId, observations]) => ({
          monopolyId,
          inventory: [...observations.entries()]
            .filter(([, observation]) => observation.count > 0)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, observation]) => ({ date, count: observation.count })),
        }))
        .filter(({ inventory }) => inventory.length > 0),
    }))
    .filter(({ monopolies }) => monopolies.length > 0);
}

function finishMonopolyProjections(
  values: ObservationMap,
  month: string,
): MonthlyMonopolyProjection[] {
  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([monopolyId, related]) => ({
      schemaVersion: 1 as const,
      month,
      monopolyId,
      wines: [...related.entries()]
        .sort(([left], [right]) => left - right)
        .map(([wineId, observations]) => ({
          wineId,
          inventory: [...observations.entries()]
            .filter(([, observation]) => observation.count > 0)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, observation]) => ({ date, count: observation.count })),
        }))
        .filter(({ inventory }) => inventory.length > 0),
    }))
    .filter(({ wines }) => wines.length > 0);
}
