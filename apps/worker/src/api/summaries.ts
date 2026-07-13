import type {
  AvailabilitySummary,
  DailyInventory,
  MonopolyCatalogItem,
  MonopolySummary,
  Period,
  WineCatalogItem,
  WineSummary,
} from "@bwv/contracts";

import { HttpError } from "../errors";
import { getWineCatalog } from "../ingestion/catalogs";
import type { InventoryObservation } from "./daily-inventory";
import { getCompletedDates, loadInventoryObservations } from "./daily-inventory";
import { isWineRequiredAtStore } from "./statistics";

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
    ...(validRelatedIds === undefined
      ? {}
      : {
          currentlySoldOut: Math.max(
            validRelatedIds.size -
              (latestDate === undefined
                ? 0
                : [...observations.values()].filter((dates) => dates.has(latestDate)).length),
            0,
          ),
        }),
    bottlesByDate: knownDates.map((date) => ({ date, count: bottleTotals.get(date) ?? 0 })),
  };
}

function numericId(value: string): number {
  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new HttpError(503, "dataset_invalid", `Inventory references invalid id ${value}`);
  }
  return parsed;
}

function indexObservations(
  observations: readonly InventoryObservation[],
  primary: "wine" | "monopoly",
): Map<number, Map<number, DailyInventory[]>> {
  const indexed = new Map<number, Map<number, DailyInventory[]>>();
  for (const observation of observations) {
    const wineId = numericId(observation.productId);
    const monopolyId = numericId(observation.storeId);
    const primaryId = primary === "wine" ? wineId : monopolyId;
    const relatedId = primary === "wine" ? monopolyId : wineId;
    const related = indexed.get(primaryId) ?? new Map<number, DailyInventory[]>();
    const inventory = related.get(relatedId) ?? [];
    inventory.push({ date: observation.date, count: observation.count });
    related.set(relatedId, inventory);
    indexed.set(primaryId, related);
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

export function countExpectedSoldOut(
  entries: readonly RelatedInventory[],
  latestDate: string,
  expectedRelatedIds: ReadonlySet<number>,
): number {
  const currentlyStocked = new Set(
    entries
      .filter((entry) =>
        entry.inventory.some(({ date, count }) => date === latestDate && count > 0),
      )
      .map(({ relatedId }) => relatedId),
  );
  return [...expectedRelatedIds].filter((relatedId) => !currentlyStocked.has(relatedId)).length;
}

export function countCurrentStockByAssortment(
  entries: readonly RelatedInventory[],
  latestDate: string,
  expectedRelatedIds: ReadonlySet<number>,
): { currentlyFixedInStock: number; currentlyAdditionalInStock: number } {
  const currentlyStocked = new Set(
    entries
      .filter((entry) =>
        entry.inventory.some(({ date, count }) => date === latestDate && count > 0),
      )
      .map(({ relatedId }) => relatedId),
  );
  const currentlyFixedInStock = [...currentlyStocked].filter((relatedId) =>
    expectedRelatedIds.has(relatedId),
  ).length;
  return {
    currentlyFixedInStock,
    currentlyAdditionalInStock: currentlyStocked.size - currentlyFixedInStock,
  };
}

async function summaryContext(env: Env, period: Period, productIds: readonly string[]) {
  const completed = await getCompletedDates(env.DATA_BUCKET, period);
  if (completed.length === 0) {
    throw new HttpError(503, "dataset_unavailable", "No requested inventory date is available");
  }
  const knownDates = completed.map(({ date }) => date);
  const observations = await loadInventoryObservations(env.DATA_BUCKET, knownDates, productIds);
  return { knownDates, observations };
}

export async function summarizeWines(
  env: Env,
  wines: readonly WineSummary[],
  period: Period,
): Promise<WineCatalogItem[]> {
  const { knownDates, observations } = await summaryContext(
    env,
    period,
    wines.map(({ productNumber }) => productNumber),
  );
  const index = indexObservations(observations, "wine");
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
  const wines = await getWineCatalog(env);
  const { knownDates, observations } = await summaryContext(
    env,
    period,
    wines.map(({ productNumber }) => productNumber),
  );
  const index = indexObservations(observations, "monopoly");
  const latestDate = knownDates.at(-1)!;
  return monopolies.map((monopoly) => {
    const entries = entriesFor(index, monopoly.id);
    const expectedWineIds = new Set(
      wines.filter((wine) => isWineRequiredAtStore(wine, monopoly)).map(({ id }) => id),
    );
    const currentStockByAssortment = countCurrentStockByAssortment(
      entries,
      latestDate,
      expectedWineIds,
    );
    return {
      ...monopoly,
      availability: {
        ...summarizeAvailability(entries, knownDates),
        ...currentStockByAssortment,
        currentlySoldOut: countExpectedSoldOut(entries, latestDate, expectedWineIds),
      },
    };
  });
}
