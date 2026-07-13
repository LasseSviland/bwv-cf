import type {
  DailyStockoutStatistics,
  Freshness,
  MonopolySummary,
  Period,
  StatisticsResponse,
  StockoutSummary,
  WineSummary,
} from "@bwv/contracts";
import { monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import { getMonopolyCatalog, getWineCatalog } from "../ingestion/catalogs";
import type { CompletedInventoryDate } from "../types";
import type { InventoryObservation } from "./daily-inventory";
import { getCompletedDates, visitDailyInventoryObservations } from "./daily-inventory";

interface ParsedGrade {
  category: number;
  profile: "L" | "R" | null;
}

interface TrackedPair {
  wineId: number;
  storeId: number;
}

interface CalculateStatisticsInput {
  knownDates: readonly string[];
  comparisonDate: string | null;
  wines: readonly WineSummary[];
  monopolies: readonly MonopolySummary[];
  observations: readonly InventoryObservation[];
}

interface DailyIntermediate {
  date: string;
  inStockPairs: number;
  positiveByWine: Map<number, number>;
  positiveByStore: Map<number, number>;
  newlySoldOutPairs: number;
  bottlesLostToStockouts: number;
  totalBottles: number;
}

const pairKey = (wineId: number, storeId: number): string => `${wineId}:${storeId}`;

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
  private readonly storeByNumber: ReadonlyMap<string, MonopolySummary>;
  private readonly knownDateSet: ReadonlySet<string>;
  private readonly trackedPairs = new Map<string, TrackedPair>();
  private readonly positiveDaysByPair = new Map<string, number>();
  private readonly intermediate: DailyIntermediate[] = [];
  private previousStock: Map<string, number> | null = null;

  constructor(
    private readonly knownDates: readonly string[],
    private readonly comparisonDate: string | null,
    wines: readonly WineSummary[],
    monopolies: readonly MonopolySummary[],
  ) {
    const currentWines = wines.filter(
      (wine) => wine.outdatedAt === undefined || wine.outdatedAt === null,
    );
    this.wineByProductNumber = new Map(currentWines.map((wine) => [wine.productNumber, wine]));
    this.storeByNumber = new Map(monopolies.map((monopoly) => [monopoly.storeNumber, monopoly]));
    this.knownDateSet = new Set(knownDates);
    for (const wine of currentWines) {
      for (const monopoly of monopolies) {
        if (!isWineRequiredAtStore(wine, monopoly)) continue;
        this.trackedPairs.set(pairKey(wine.id, monopoly.id), {
          wineId: wine.id,
          storeId: monopoly.id,
        });
      }
    }
  }

  addDate(date: string, observations: readonly InventoryObservation[]): void {
    const currentStock = new Map<string, number>();
    for (const observation of observations) {
      const wine = this.wineByProductNumber.get(observation.productId);
      const monopoly = this.storeByNumber.get(observation.storeId);
      if (wine === undefined || monopoly === undefined) continue;
      const key = pairKey(wine.id, monopoly.id);
      this.trackedPairs.set(key, { wineId: wine.id, storeId: monopoly.id });
      currentStock.set(key, (currentStock.get(key) ?? 0) + observation.count);
    }

    if (date === this.comparisonDate) {
      this.previousStock = currentStock;
      return;
    }
    if (!this.knownDateSet.has(date)) return;

    const positiveByWine = new Map<number, number>();
    const positiveByStore = new Map<number, number>();
    let totalBottles = 0;
    for (const [key, count] of currentStock) {
      const pair = this.trackedPairs.get(key);
      if (pair === undefined) continue;
      positiveByWine.set(pair.wineId, (positiveByWine.get(pair.wineId) ?? 0) + 1);
      positiveByStore.set(pair.storeId, (positiveByStore.get(pair.storeId) ?? 0) + 1);
      this.positiveDaysByPair.set(key, (this.positiveDaysByPair.get(key) ?? 0) + 1);
      totalBottles += count;
    }

    let newlySoldOutPairs = 0;
    let bottlesLostToStockouts = 0;
    if (this.previousStock !== null) {
      for (const [key, previousCount] of this.previousStock) {
        if (!currentStock.has(key)) {
          newlySoldOutPairs += 1;
          bottlesLostToStockouts += previousCount;
        }
      }
    }
    this.intermediate.push({
      date,
      inStockPairs: currentStock.size,
      positiveByWine,
      positiveByStore,
      newlySoldOutPairs,
      bottlesLostToStockouts,
      totalBottles,
    });
    this.previousStock = currentStock;
  }

  finish(): Pick<StatisticsResponse, "comparisonDate" | "daily" | "summary"> {
    const trackedByWine = new Map<number, number>();
    const trackedByStore = new Map<number, number>();
    for (const pair of this.trackedPairs.values()) {
      trackedByWine.set(pair.wineId, (trackedByWine.get(pair.wineId) ?? 0) + 1);
      trackedByStore.set(pair.storeId, (trackedByStore.get(pair.storeId) ?? 0) + 1);
    }

    const soldOutPairKeys = new Set(
      [...this.trackedPairs.keys()].filter(
        (key) => (this.positiveDaysByPair.get(key) ?? 0) < this.knownDates.length,
      ),
    );
    const soldOutWineIds = new Set<number>();
    const affectedStoreIds = new Set<number>();
    for (const key of soldOutPairKeys) {
      const pair = this.trackedPairs.get(key);
      if (pair === undefined) continue;
      soldOutWineIds.add(pair.wineId);
      affectedStoreIds.add(pair.storeId);
    }

    const daily: DailyStockoutStatistics[] = this.intermediate.map((entry) => ({
      date: entry.date,
      trackedPairs: this.trackedPairs.size,
      inStockPairs: entry.inStockPairs,
      soldOutPairs: this.trackedPairs.size - entry.inStockPairs,
      distinctWinesSoldOut: [...trackedByWine].filter(
        ([wineId, tracked]) => (entry.positiveByWine.get(wineId) ?? 0) < tracked,
      ).length,
      distinctStoresAffected: [...trackedByStore].filter(
        ([storeId, tracked]) => (entry.positiveByStore.get(storeId) ?? 0) < tracked,
      ).length,
      newlySoldOutPairs: entry.newlySoldOutPairs,
      bottlesLostToStockouts: entry.bottlesLostToStockouts,
      totalBottles: entry.totalBottles,
    }));

    const stockoutPairDays = daily.reduce((total, entry) => total + entry.soldOutPairs, 0);
    const inStockPairDays = daily.reduce((total, entry) => total + entry.inStockPairs, 0);
    const trackedPairDays = this.trackedPairs.size * this.knownDates.length;
    const peak = daily.reduce<DailyStockoutStatistics | null>(
      (current, entry) =>
        current === null || entry.soldOutPairs > current.soldOutPairs ? entry : current,
      null,
    );
    const summary: StockoutSummary = {
      observedDays: this.knownDates.length,
      daysWithStockouts: daily.filter(({ soldOutPairs }) => soldOutPairs > 0).length,
      trackedPairs: this.trackedPairs.size,
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
    return { comparisonDate: this.comparisonDate, daily, summary };
  }
}

export function calculateStockoutStatistics({
  knownDates,
  comparisonDate,
  wines,
  monopolies,
  observations,
}: CalculateStatisticsInput): Pick<StatisticsResponse, "comparisonDate" | "daily" | "summary"> {
  const accumulator = new StockoutStatisticsAccumulator(
    knownDates,
    comparisonDate,
    wines,
    monopolies,
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
  const [wines, monopolies, allCompleted] = await Promise.all([
    getWineCatalog(env),
    getMonopolyCatalog(env),
    getCompletedDates(env.DATA_BUCKET),
  ]);
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
  );
  await visitDailyInventoryObservations(
    env.DATA_BUCKET,
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
    etagSeed: `statistics:${period.from}:${period.to}:${[
      ...(comparison === null ? [] : [comparison]),
      ...completed,
    ]
      .map(({ etag }) => etag)
      .join(":")}`,
  };
}
