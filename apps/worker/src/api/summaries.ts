import type {
  AvailabilitySummary,
  DailyInventory,
  MonopolyCatalogItem,
  MonopolySummary,
  Period,
  WineCatalogItem,
  WineSummary,
} from "@bwv/contracts";
import { monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import { getPublishedMonths } from "../storage/d1";
import type { DailyInventorySnapshot } from "../types";
import { coveredDates, loadDailyInventory } from "./daily-inventory";

export interface RelatedInventory {
  relatedId: number;
  inventory: DailyInventory[];
}

export function summarizeAvailability(
  entries: readonly RelatedInventory[],
  knownDates: readonly string[],
  validRelatedIds?: ReadonlySet<number>,
): AvailabilitySummary {
  if (knownDates.length === 0) {
    return {
      soldOutAtSomePoint: 0,
      inStockAtSomePoint: 0,
      currentlyInStock: 0,
      bottlesByDate: [],
    };
  }
  const latestDate = knownDates.at(-1);
  const knownDateSet = new Set(knownDates);
  const observations = new Map<number, Set<string>>();
  const bottleTotals = new Map(knownDates.map((date) => [date, 0]));
  for (const entry of entries) {
    if (validRelatedIds !== undefined && !validRelatedIds.has(entry.relatedId)) continue;
    const dates = observations.get(entry.relatedId) ?? new Set<string>();
    entry.inventory.forEach(({ date, count }) => {
      if (!knownDateSet.has(date)) return;
      dates.add(date);
      bottleTotals.set(date, (bottleTotals.get(date) ?? 0) + count);
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
    bottlesByDate: knownDates.map((date) => ({ date, count: bottleTotals.get(date) ?? 0 })),
  };
}

function indexSnapshots(
  snapshots: readonly DailyInventorySnapshot[],
  primary: "wine" | "monopoly",
): Map<number, Map<number, DailyInventory[]>> {
  const indexed = new Map<number, Map<number, DailyInventory[]>>();
  for (const snapshot of snapshots) {
    for (const row of snapshot.inventory) {
      const primaryId = primary === "wine" ? row.wineId : row.monopolyId;
      const relatedId = primary === "wine" ? row.monopolyId : row.wineId;
      const related = indexed.get(primaryId) ?? new Map<number, DailyInventory[]>();
      const inventory = related.get(relatedId) ?? [];
      inventory.push({ date: snapshot.date, count: row.count });
      related.set(relatedId, inventory);
      indexed.set(primaryId, related);
    }
  }
  return indexed;
}

function entriesFor(
  index: ReadonlyMap<number, ReadonlyMap<number, DailyInventory[]>>,
  primaryId: number,
): RelatedInventory[] {
  return [...(index.get(primaryId)?.entries() ?? [])].map(([relatedId, inventory]) => ({
    relatedId,
    inventory,
  }));
}

async function summaryContext(env: Env, period: Period) {
  const published = await getPublishedMonths(env.DB, monthsForPeriod(period));
  if (published.length === 0) {
    throw new HttpError(503, "dataset_unavailable", "No requested dataset month is available");
  }
  const snapshots = await loadDailyInventory(env.DATA_BUCKET, period, published);
  return { knownDates: coveredDates(period, published), snapshots };
}

export async function summarizeWines(
  env: Env,
  wines: readonly WineSummary[],
  period: Period,
): Promise<WineCatalogItem[]> {
  const { knownDates, snapshots } = await summaryContext(env, period);
  const index = indexSnapshots(snapshots, "wine");
  return wines.map((wine) => ({
    ...wine,
    availability: summarizeAvailability(entriesFor(index, wine.id), knownDates),
  }));
}

export async function summarizeMonopolies(
  env: Env,
  monopolies: readonly MonopolySummary[],
  period: Period,
): Promise<MonopolyCatalogItem[]> {
  const { knownDates, snapshots } = await summaryContext(env, period);
  const index = indexSnapshots(snapshots, "monopoly");
  return monopolies.map((monopoly) => ({
    ...monopoly,
    availability: summarizeAvailability(entriesFor(index, monopoly.id), knownDates),
  }));
}
