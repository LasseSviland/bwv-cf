import { z } from "zod";

import {
  DailyInventorySchema,
  type Freshness,
  type MonopolyInventoryResponse,
  type Period,
  type WineInventoryResponse,
} from "@bwv/contracts";
import { mergeAndZeroFillInventorySeries, monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import { getMonopolyCatalog, getWineCatalog } from "../ingestion/catalogs";
import { getPublishedMonths } from "../storage/d1";
import { monopolyProjectionKey, wineProjectionKey } from "../storage/keys";
import type { MonthlyMonopolyProjection, MonthlyWineProjection, PublishedMonthRow } from "../types";

const MonthlyWineProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    month: z.string(),
    wineId: z.number().int().positive(),
    monopolies: z.array(
      z
        .object({
          monopolyId: z.number().int().positive(),
          inventory: z.array(DailyInventorySchema),
        })
        .strict(),
    ),
  })
  .strict();

const MonthlyMonopolyProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    month: z.string(),
    monopolyId: z.number().int().positive(),
    wines: z.array(
      z
        .object({
          wineId: z.number().int().positive(),
          inventory: z.array(DailyInventorySchema),
        })
        .strict(),
    ),
  })
  .strict();

function freshnessFor(
  requestedMonths: readonly string[],
  published: readonly PublishedMonthRow[],
): Freshness {
  if (published.length === 0) {
    throw new HttpError(503, "dataset_unavailable", "No requested dataset month is available");
  }
  const available = new Set(published.map(({ month }) => month));
  const missingMonths = requestedMonths.filter((month) => !available.has(month));
  const datasetGeneratedAt = published
    .map(({ generatedAt }) => generatedAt)
    .sort()
    .at(-1);
  const coveredThrough = published
    .map((month) => month.coveredThrough)
    .sort()
    .at(-1);
  if (datasetGeneratedAt === undefined || coveredThrough === undefined) {
    throw new HttpError(503, "dataset_unavailable", "Dataset freshness is unavailable");
  }
  return {
    datasetGeneratedAt,
    sourceWatermark: Math.max(...published.map(({ sourceWatermark }) => sourceWatermark)),
    coveredThrough,
    ...(missingMonths.length > 0 ? { missingMonths } : {}),
  };
}

async function optionalProjection<T>(
  bucket: R2Bucket,
  key: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const object = await bucket.get(key);
  if (object === null) return null;
  return parse(await object.json<unknown>());
}

export async function assembleWineInventory(
  env: Env,
  wineId: number,
  period: Period,
): Promise<{ etagSeed: string; response: WineInventoryResponse }> {
  const requestedMonths = monthsForPeriod(period);
  const [wines, monopolies, published] = await Promise.all([
    getWineCatalog(env),
    getMonopolyCatalog(env),
    getPublishedMonths(env.DB, requestedMonths),
  ]);
  const wine = wines.find(({ id }) => id === wineId);
  if (wine === undefined) throw new HttpError(404, "wine_not_found", "Wine was not found");
  const monopolyById = new Map(monopolies.map((monopoly) => [monopoly.id, monopoly]));
  const series = new Map<number, Array<MonthlyWineProjection["monopolies"][number]["inventory"]>>();

  for (const month of published) {
    const projection = await optionalProjection(
      env.DATA_BUCKET,
      wineProjectionKey(month.month, month.generation, wineId),
      (value): MonthlyWineProjection => MonthlyWineProjectionSchema.parse(value),
    );
    if (projection === null) continue;
    for (const entry of projection.monopolies) {
      const values = series.get(entry.monopolyId) ?? [];
      values.push(entry.inventory);
      series.set(entry.monopolyId, values);
    }
  }

  const response: WineInventoryResponse = {
    ...freshnessFor(requestedMonths, published),
    wine,
    period,
    monopolies: [...series.entries()]
      .map(([monopolyId, values]) => {
        const monopoly = monopolyById.get(monopolyId);
        if (monopoly === undefined) {
          throw new HttpError(503, "dataset_invalid", "Dataset references an unknown monopoly");
        }
        return {
          monopoly,
          inventory: mergeAndZeroFillInventorySeries(values, period, { maxDays: 366 }),
        };
      })
      .sort((left, right) => left.monopoly.name.localeCompare(right.monopoly.name, "nb-NO")),
  };
  return {
    response,
    etagSeed: `wine:${wineId}:${period.from}:${period.to}:${published.map((row) => row.etag).join(":")}`,
  };
}

export async function assembleMonopolyInventory(
  env: Env,
  monopolyId: number,
  period: Period,
): Promise<{ etagSeed: string; response: MonopolyInventoryResponse }> {
  const requestedMonths = monthsForPeriod(period);
  const [wines, monopolies, published] = await Promise.all([
    getWineCatalog(env),
    getMonopolyCatalog(env),
    getPublishedMonths(env.DB, requestedMonths),
  ]);
  const monopoly = monopolies.find(({ id }) => id === monopolyId);
  if (monopoly === undefined) {
    throw new HttpError(404, "monopoly_not_found", "Monopoly was not found");
  }
  const wineById = new Map(wines.map((wine) => [wine.id, wine]));
  const series = new Map<number, Array<MonthlyMonopolyProjection["wines"][number]["inventory"]>>();

  for (const month of published) {
    const projection = await optionalProjection(
      env.DATA_BUCKET,
      monopolyProjectionKey(month.month, month.generation, monopolyId),
      (value): MonthlyMonopolyProjection => MonthlyMonopolyProjectionSchema.parse(value),
    );
    if (projection === null) continue;
    for (const entry of projection.wines) {
      const values = series.get(entry.wineId) ?? [];
      values.push(entry.inventory);
      series.set(entry.wineId, values);
    }
  }

  const response: MonopolyInventoryResponse = {
    ...freshnessFor(requestedMonths, published),
    monopoly,
    period,
    wines: [...series.entries()]
      .map(([wineId, values]) => {
        const wine = wineById.get(wineId);
        if (wine === undefined) {
          throw new HttpError(503, "dataset_invalid", "Dataset references an unknown wine");
        }
        return {
          wine,
          inventory: mergeAndZeroFillInventorySeries(values, period, { maxDays: 366 }),
        };
      })
      .sort((left, right) => left.wine.name.localeCompare(right.wine.name, "nb-NO")),
  };
  return {
    response,
    etagSeed: `monopoly:${monopolyId}:${period.from}:${period.to}:${published.map((row) => row.etag).join(":")}`,
  };
}
