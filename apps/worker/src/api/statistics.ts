import {
  DateStringSchema,
  type DailyStockoutStatistics,
  type Freshness,
  type MonopolySummary,
  type Period,
  type StatisticsResponse,
  type StockoutSummary,
  type StockoutWineStatistics,
  type WineSummary,
} from "@bwv/contracts";
import { monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import {
  activeWineSources,
  getRawMonopolyCatalog,
  getRawWineCatalog,
  monopolySummaryFromSource,
  wineSummaryFromSource,
} from "../ingestion/catalogs";
import { nestedString } from "../ingestion/vinmonopolet";
import type { CompletedInventoryDate, JsonObject } from "../types";
import type { InventoryObservation } from "./daily-inventory";
import { getCompletedDates, visitDailyInventoryObservations } from "./daily-inventory";

interface ParsedGrade {
  category: number;
  profile: "L" | "R" | null;
}

interface TrackedPair {
  wineId: number;
  storeId: number;
  activeFrom: string | null;
}

interface CalculateStatisticsInput {
  knownDates: readonly string[];
  comparisonDate: string | null;
  wines: readonly WineSummary[];
  monopolies: readonly MonopolySummary[];
  observations: readonly InventoryObservation[];
  fixedAssortmentFromByWineId?: ReadonlyMap<number, string>;
}

interface DailyIntermediate {
  date: string;
  trackedPairs: number;
  inStockPairs: number;
  soldOutPairKeys: Set<string>;
  soldOutWineIds: Set<number>;
  affectedStoreIds: Set<number>;
  trackedStoresByWine: Map<number, number>;
  soldOutStoresByWine: Map<number, number>;
  newlySoldOutPairs: number;
  bottlesLostToStockouts: number;
  totalBottles: number;
}

const pairKey = (wineId: number, storeId: number): string => `${wineId}:${storeId}`;

function validSourceDate(value: string | null): string | null {
  if (value === null) return null;
  const parsed = DateStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function fixedAssortmentFromSource(wine: JsonObject): string | null {
  return (
    validSourceDate(nestedString(wine, "assortment", "validFrom")) ??
    validSourceDate(nestedString(wine, "basic", "introductionDate"))
  );
}

function parsedGrades(wine: WineSummary): ParsedGrade[] {
  const values =
    wine.assortmentGrades && wine.assortmentGrades.length > 0
      ? wine.assortmentGrades
      : wine.wineCategory
        ? [wine.wineCategory]
        : [];
  const grades = values.flatMap((value) =>
    [...value.matchAll(/(?:SB)?([1-6])([LR])?/gi)].flatMap((match) => {
      const category = Number(match[1]);
      if (!Number.isSafeInteger(category)) return [];
      return [{ category, profile: (match[2]?.toUpperCase() as "L" | "R" | undefined) ?? null }];
    }),
  );
  return [
    ...new Map(grades.map((grade) => [`${grade.category}:${grade.profile ?? ""}`, grade])).values(),
  ];
}

function storeCategory(monopoly: MonopolySummary): number | null {
  const match = (monopoly.monopolyCategory ?? monopoly.storeAssortment ?? "").match(/[1-6]/);
  return match ? Number(match[0]) : null;
}

function storeProfile(monopoly: MonopolySummary): "L" | "R" | null {
  const assortmentMatch = monopoly.storeAssortment?.match(/[1-6]\s*([LR])/i);
  if (assortmentMatch?.[1]) return assortmentMatch[1].toUpperCase() as "L" | "R";
  const normalized = monopoly.monopolyProfile?.toLocaleLowerCase("nb-NO") ?? "";
  if (normalized.includes("lyst") || normalized.includes("lett")) return "L";
  if (normalized.includes("rødt") || normalized.includes("mørkt")) return "R";
  return null;
}

export function isWineRequiredAtStore(wine: WineSummary, monopoly: MonopolySummary): boolean {
  if (wine.outdatedAt !== undefined && wine.outdatedAt !== null) return false;
  const category = storeCategory(monopoly);
  const grades = parsedGrades(wine);
  if (category === null || grades.length === 0) return false;
  const profile = storeProfile(monopoly);
  const relevantGrades = profile
    ? grades.filter((grade) => grade.profile === null || grade.profile === profile)
    : grades;
  return relevantGrades.some((grade) => grade.category <= category);
}

function freshnessFor(period: Period, completed: readonly CompletedInventoryDate[]): Freshness {
  const latest = completed.at(-1);
  if (latest === undefined) {
    throw new HttpError(503, "dataset_unavailable", "No requested inventory date is available");
  }
  const requestedMonths = monthsForPeriod(period);
  const availableMonths = new Set(completed.map(({ date }) => date.slice(0, 7)));
  const missingMonths = requestedMonths.filter((month) => !availableMonths.has(month));
  return {
    datasetGeneratedAt: latest.uploaded.toISOString(),
    sourceWatermark: latest.uploaded.getTime(),
    coveredThrough: latest.date,
    availableDates: completed.map(({ date }) => date),
    ...(missingMonths.length > 0 ? { missingMonths } : {}),
  };
}

class StockoutStatisticsAccumulator {
  private readonly wineByProductNumber: ReadonlyMap<string, WineSummary>;
  private readonly wineById: ReadonlyMap<number, WineSummary>;
  private readonly storeByNumber: ReadonlyMap<string, MonopolySummary>;
  private readonly knownDateSet: ReadonlySet<string>;
  private readonly fixedPairs = new Map<string, TrackedPair>();
  private readonly intermediate: DailyIntermediate[] = [];
  private previousStock: Map<string, number> | null = null;

  constructor(
    private readonly knownDates: readonly string[],
    private readonly comparisonDate: string | null,
    wines: readonly WineSummary[],
    monopolies: readonly MonopolySummary[],
    fixedAssortmentFromByWineId: ReadonlyMap<number, string> = new Map(),
  ) {
    const currentWines = wines.filter(
      (wine) => wine.outdatedAt === undefined || wine.outdatedAt === null,
    );
    this.wineByProductNumber = new Map(currentWines.map((wine) => [wine.productNumber, wine]));
    this.wineById = new Map(currentWines.map((wine) => [wine.id, wine]));
    this.storeByNumber = new Map(monopolies.map((monopoly) => [monopoly.storeNumber, monopoly]));
    this.knownDateSet = new Set(knownDates);
    for (const wine of currentWines) {
      for (const monopoly of monopolies) {
        if (!isWineRequiredAtStore(wine, monopoly)) continue;
        this.fixedPairs.set(pairKey(wine.id, monopoly.id), {
          wineId: wine.id,
          storeId: monopoly.id,
          activeFrom: fixedAssortmentFromByWineId.get(wine.id) ?? null,
        });
      }
    }
  }

  private pairIsActive(pair: TrackedPair, date: string): boolean {
    return pair.activeFrom === null || pair.activeFrom <= date;
  }

  addDate(date: string, observations: readonly InventoryObservation[]): void {
    const allStock = new Map<string, number>();
    let totalBottles = 0;
    for (const observation of observations) {
      const wine = this.wineByProductNumber.get(observation.productId);
      const monopoly = this.storeByNumber.get(observation.storeId);
      if (wine === undefined || monopoly === undefined) continue;
      const key = pairKey(wine.id, monopoly.id);
      allStock.set(key, (allStock.get(key) ?? 0) + observation.count);
      totalBottles += observation.count;
    }

    const currentStock = new Map<string, number>();
    for (const [key, count] of allStock) {
      const pair = this.fixedPairs.get(key);
      if (pair !== undefined && this.pairIsActive(pair, date)) currentStock.set(key, count);
    }

    if (date === this.comparisonDate) {
      this.previousStock = currentStock;
      return;
    }
    if (!this.knownDateSet.has(date)) return;

    const soldOutPairKeys = new Set<string>();
    const soldOutWineIds = new Set<number>();
    const affectedStoreIds = new Set<number>();
    const trackedStoresByWine = new Map<number, number>();
    const soldOutStoresByWine = new Map<number, number>();
    let trackedPairs = 0;
    for (const [key, pair] of this.fixedPairs) {
      if (!this.pairIsActive(pair, date)) continue;
      trackedPairs += 1;
      trackedStoresByWine.set(pair.wineId, (trackedStoresByWine.get(pair.wineId) ?? 0) + 1);
      if (currentStock.has(key)) continue;
      soldOutPairKeys.add(key);
      soldOutWineIds.add(pair.wineId);
      affectedStoreIds.add(pair.storeId);
      soldOutStoresByWine.set(pair.wineId, (soldOutStoresByWine.get(pair.wineId) ?? 0) + 1);
    }

    let newlySoldOutPairs = 0;
    let bottlesLostToStockouts = 0;
    if (this.previousStock !== null) {
      for (const [key, previousCount] of this.previousStock) {
        const pair = this.fixedPairs.get(key);
        if (pair !== undefined && this.pairIsActive(pair, date) && !currentStock.has(key)) {
          newlySoldOutPairs += 1;
          bottlesLostToStockouts += previousCount;
        }
      }
    }
    this.intermediate.push({
      date,
      trackedPairs,
      inStockPairs: currentStock.size,
      soldOutPairKeys,
      soldOutWineIds,
      affectedStoreIds,
      trackedStoresByWine,
      soldOutStoresByWine,
      newlySoldOutPairs,
      bottlesLostToStockouts,
      totalBottles,
    });
    this.previousStock = currentStock;
  }

  finish(): Pick<StatisticsResponse, "comparisonDate" | "daily" | "wines" | "summary"> {
    const soldOutPairKeys = new Set<string>();
    const soldOutWineIds = new Set<number>();
    const affectedStoreIds = new Set<number>();
    for (const entry of this.intermediate) {
      entry.soldOutPairKeys.forEach((key) => soldOutPairKeys.add(key));
      entry.soldOutWineIds.forEach((wineId) => soldOutWineIds.add(wineId));
      entry.affectedStoreIds.forEach((storeId) => affectedStoreIds.add(storeId));
    }

    const daily: DailyStockoutStatistics[] = this.intermediate.map((entry) => ({
      date: entry.date,
      trackedPairs: entry.trackedPairs,
      inStockPairs: entry.inStockPairs,
      soldOutPairs: entry.soldOutPairKeys.size,
      distinctWinesSoldOut: entry.soldOutWineIds.size,
      distinctStoresAffected: entry.affectedStoreIds.size,
      newlySoldOutPairs: entry.newlySoldOutPairs,
      bottlesLostToStockouts: entry.bottlesLostToStockouts,
      totalBottles: entry.totalBottles,
    }));

    const stockoutPairDays = daily.reduce((total, entry) => total + entry.soldOutPairs, 0);
    const inStockPairDays = daily.reduce((total, entry) => total + entry.inStockPairs, 0);
    const trackedPairDays = daily.reduce((total, entry) => total + entry.trackedPairs, 0);
    const peak = daily.reduce<DailyStockoutStatistics | null>(
      (current, entry) =>
        current === null || entry.soldOutPairs > current.soldOutPairs ? entry : current,
      null,
    );
    const latest = this.intermediate.at(-1);
    const wines: StockoutWineStatistics[] = [...soldOutWineIds]
      .flatMap((wineId) => {
        const wine = this.wineById.get(wineId);
        if (wine === undefined) return [];
        const soldOutDates = this.intermediate.flatMap((entry) => {
          const storesSoldOut = entry.soldOutStoresByWine.get(wineId) ?? 0;
          return storesSoldOut > 0 ? [{ date: entry.date, storesSoldOut }] : [];
        });
        const storeDaysSoldOut = soldOutDates.reduce(
          (total, entry) => total + entry.storesSoldOut,
          0,
        );
        const trackedStoreDays = this.intermediate.reduce(
          (total, entry) => total + (entry.trackedStoresByWine.get(wineId) ?? 0),
          0,
        );
        const winePeak = soldOutDates.reduce<(typeof soldOutDates)[number]>(
          (current, entry) => (entry.storesSoldOut > current.storesSoldOut ? entry : current),
          soldOutDates[0]!,
        );
        return [
          {
            wine,
            fixedStores: latest?.trackedStoresByWine.get(wineId) ?? 0,
            soldOutDays: soldOutDates.length,
            storeDaysSoldOut,
            currentStoresSoldOut: latest?.soldOutStoresByWine.get(wineId) ?? 0,
            availabilityRate:
              trackedStoreDays === 0 ? 0 : (trackedStoreDays - storeDaysSoldOut) / trackedStoreDays,
            peak: winePeak,
            soldOutDates,
          },
        ];
      })
      .sort(
        (left, right) =>
          right.storeDaysSoldOut - left.storeDaysSoldOut ||
          right.currentStoresSoldOut - left.currentStoresSoldOut ||
          left.wine.name.localeCompare(right.wine.name, "nb-NO"),
      );
    const summary: StockoutSummary = {
      observedDays: this.knownDates.length,
      daysWithStockouts: daily.filter(({ soldOutPairs }) => soldOutPairs > 0).length,
      trackedPairs: daily.at(-1)?.trackedPairs ?? 0,
      stockoutPairDays,
      distinctPairsSoldOut: soldOutPairKeys.size,
      distinctWinesSoldOut: soldOutWineIds.size,
      distinctStoresAffected: affectedStoreIds.size,
      newlySoldOutPairs: daily.reduce((total, entry) => total + entry.newlySoldOutPairs, 0),
      bottlesLostToStockouts: daily.reduce(
        (total, entry) => total + entry.bottlesLostToStockouts,
        0,
      ),
      averageDailyStockouts:
        this.knownDates.length === 0 ? 0 : stockoutPairDays / this.knownDates.length,
      availabilityRate: trackedPairDays === 0 ? 0 : inStockPairDays / trackedPairDays,
      peak: peak === null ? null : { date: peak.date, soldOutPairs: peak.soldOutPairs },
    };
    return { comparisonDate: this.comparisonDate, daily, wines, summary };
  }
}

export function calculateStockoutStatistics({
  knownDates,
  comparisonDate,
  wines,
  monopolies,
  observations,
  fixedAssortmentFromByWineId,
}: CalculateStatisticsInput): Pick<
  StatisticsResponse,
  "comparisonDate" | "daily" | "wines" | "summary"
> {
  const accumulator = new StockoutStatisticsAccumulator(
    knownDates,
    comparisonDate,
    wines,
    monopolies,
    fixedAssortmentFromByWineId,
  );
  const observationsByDate = new Map<string, InventoryObservation[]>(
    [...(comparisonDate === null ? [] : [comparisonDate]), ...knownDates].map((date) => [date, []]),
  );
  for (const observation of observations) {
    observationsByDate.get(observation.date)?.push(observation);
  }
  for (const [date, dailyObservations] of observationsByDate) {
    accumulator.addDate(date, dailyObservations);
  }
  return accumulator.finish();
}

export async function getStatistics(
  env: Env,
  period: Period,
): Promise<{
  etagSeed: string;
  response: StatisticsResponse;
}> {
  const [wineFile, monopolyFile, allCompleted] = await Promise.all([
    getRawWineCatalog(env),
    getRawMonopolyCatalog(env),
    getCompletedDates(env),
  ]);
  const wineSources = activeWineSources(wineFile);
  const wines = wineSources.map((wine) => wineSummaryFromSource(wine));
  const monopolies = monopolyFile.monopolies.map(monopolySummaryFromSource);
  const fixedAssortmentFromByWineId = new Map(
    wineSources.flatMap((source, index) => {
      const activeFrom = fixedAssortmentFromSource(source);
      if (activeFrom === null) return [];
      return [[wines[index]!.id, activeFrom] as const];
    }),
  );
  const completed = allCompleted.filter(({ date }) => date >= period.from && date <= period.to);
  if (completed.length === 0) {
    throw new HttpError(503, "dataset_unavailable", "No requested inventory date is available");
  }
  const comparison = allCompleted.filter(({ date }) => date < completed[0]!.date).at(-1) ?? null;
  const knownDates = completed.map(({ date }) => date);
  const observationDates = [...(comparison === null ? [] : [comparison.date]), ...knownDates];
  const accumulator = new StockoutStatisticsAccumulator(
    knownDates,
    comparison?.date ?? null,
    wines,
    monopolies,
    fixedAssortmentFromByWineId,
  );
  await visitDailyInventoryObservations(
    env,
    observationDates,
    wines.map(({ productNumber }) => productNumber),
    (date, observations) => accumulator.addDate(date, observations),
  );
  const calculated = accumulator.finish();
  const response: StatisticsResponse = {
    ...freshnessFor(period, completed),
    period,
    ...calculated,
  };
  return {
    response,
    etagSeed: `statistics:${period.from}:${period.to}:${wineFile.syncedAt}:${monopolyFile.syncedAt}:${[
      ...(comparison === null ? [] : [comparison]),
      ...completed,
    ]
      .map(({ etag }) => etag)
      .join(":")}`,
  };
}
