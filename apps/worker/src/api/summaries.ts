import { z } from "zod";

import {
  DailyInventorySchema,
  type AvailabilitySummary,
  type MonopolyCatalogItem,
  type MonopolySummary,
  type Period,
  type WineCatalogItem,
  type WineSummary,
} from "@bwv/contracts";
import { enumerateDates, monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import { getWineCatalog } from "../ingestion/catalogs";
import { getPublishedMonths } from "../storage/d1";
import { monopolyProjectionKey, wineProjectionKey } from "../storage/keys";
import type { PublishedMonthRow } from "../types";

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

export interface RelatedInventory {
  relatedId: number;
  dates: string[];
}

function coveredDates(period: Period, published: readonly PublishedMonthRow[]): string[] {
  const byMonth = new Map(published.map((row) => [row.month, row]));
  return enumerateDates(period.from, period.to, 366).filter((date) => {
    const row = byMonth.get(date.slice(0, 7));
    return row !== undefined && date >= row.coveredFrom && date <= row.coveredThrough;
  });
}

export function summarizeAvailability(
  entries: readonly RelatedInventory[],
  knownDates: readonly string[],
  validRelatedIds?: ReadonlySet<number>,
): AvailabilitySummary {
  if (knownDates.length === 0) {
    return { soldOutAtSomePoint: 0, inStockAtSomePoint: 0, currentlyInStock: 0 };
  }
  const latestDate = knownDates.at(-1);
  const knownDateSet = new Set(knownDates);
  const observations = new Map<number, Set<string>>();
  for (const entry of entries) {
    if (validRelatedIds !== undefined && !validRelatedIds.has(entry.relatedId)) continue;
    const dates = observations.get(entry.relatedId) ?? new Set<string>();
    entry.dates.forEach((date) => {
      if (knownDateSet.has(date)) dates.add(date);
    });
    observations.set(entry.relatedId, dates);
  }
  return {
    soldOutAtSomePoint: [...observations.values()].filter((dates) => dates.size < knownDates.length)
      .length,
    inStockAtSomePoint: [...observations.values()].filter((dates) => dates.size > 0).length,
    currentlyInStock:
      latestDate === undefined
        ? 0
        : [...observations.values()].filter((dates) => dates.has(latestDate)).length,
  };
}

async function inBatches<T, R>(
  values: readonly T[],
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < values.length; offset += 10) {
    results.push(...(await Promise.all(values.slice(offset, offset + 10).map(operation))));
  }
  return results;
}

async function summaryContext(env: Env, period: Period) {
  const requestedMonths = monthsForPeriod(period);
  const published = await getPublishedMonths(env.DB, requestedMonths);
  if (published.length === 0) {
    throw new HttpError(503, "dataset_unavailable", "No requested dataset month is available");
  }
  return { published, knownDates: coveredDates(period, published) };
}

export async function summarizeWines(
  env: Env,
  wines: readonly WineSummary[],
  period: Period,
): Promise<WineCatalogItem[]> {
  const { published, knownDates } = await summaryContext(env, period);
  return inBatches(wines, async (wine) => {
    const entries: RelatedInventory[] = [];
    for (const month of published) {
      const object = await env.DATA_BUCKET.get(
        wineProjectionKey(month.month, month.generation, wine.id),
      );
      if (object === null) continue;
      const projection = MonthlyWineProjectionSchema.parse(await object.json<unknown>());
      for (const monopoly of projection.monopolies) {
        entries.push({
          relatedId: monopoly.monopolyId,
          dates: monopoly.inventory
            .map(({ date }) => date)
            .filter((date) => date >= period.from && date <= period.to),
        });
      }
    }
    return { ...wine, availability: summarizeAvailability(entries, knownDates) };
  });
}

export async function summarizeMonopolies(
  env: Env,
  monopolies: readonly MonopolySummary[],
  period: Period,
): Promise<MonopolyCatalogItem[]> {
  const [{ published, knownDates }, wines] = await Promise.all([
    summaryContext(env, period),
    getWineCatalog(env),
  ]);
  const validWineIds = new Set(wines.map(({ id }) => id));
  return inBatches(monopolies, async (monopoly) => {
    const entries: RelatedInventory[] = [];
    for (const month of published) {
      const object = await env.DATA_BUCKET.get(
        monopolyProjectionKey(month.month, month.generation, monopoly.id),
      );
      if (object === null) continue;
      const projection = MonthlyMonopolyProjectionSchema.parse(await object.json<unknown>());
      for (const wine of projection.wines) {
        entries.push({
          relatedId: wine.wineId,
          dates: wine.inventory
            .map(({ date }) => date)
            .filter((date) => date >= period.from && date <= period.to),
        });
      }
    }
    return {
      ...monopoly,
      availability: summarizeAvailability(entries, knownDates, validWineIds),
    };
  });
}
