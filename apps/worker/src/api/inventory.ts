import type {
  DailyInventory,
  Freshness,
  MonopolySummary,
  MonopolyInventoryResponse,
  Period,
  WineSummary,
  WineInventoryResponse,
} from "@bwv/contracts";
import { monthsForPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import { getMonopolyCatalog, getWineCatalog } from "../ingestion/catalogs";
import type { CompletedInventoryDate } from "../types";
import { getCompletedDates, loadInventoryObservations } from "./daily-inventory";
import { isWineRequiredAtStore } from "./statistics";

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

function zeroFillKnownDates(
  inventory: readonly DailyInventory[],
  knownDates: readonly string[],
): DailyInventory[] {
  const countByDate = new Map<string, number>();
  for (const value of inventory) {
    countByDate.set(value.date, (countByDate.get(value.date) ?? 0) + value.count);
  }
  return knownDates.map((date) => ({ date, count: countByDate.get(date) ?? 0 }));
}

export function buildWineMonopolySeries(
  wine: WineSummary,
  monopolies: readonly MonopolySummary[],
  observedSeries: ReadonlyMap<number, readonly DailyInventory[]>,
  knownDates: readonly string[],
): WineInventoryResponse["monopolies"] {
  const includedMonopolyIds = new Set(observedSeries.keys());
  for (const monopoly of monopolies) {
    if (isWineRequiredAtStore(wine, monopoly)) includedMonopolyIds.add(monopoly.id);
  }

  return monopolies
    .filter(({ id }) => includedMonopolyIds.has(id))
    .map((monopoly) => ({
      monopoly,
      inventory: zeroFillKnownDates(observedSeries.get(monopoly.id) ?? [], knownDates),
    }))
    .sort((left, right) => left.monopoly.name.localeCompare(right.monopoly.name, "nb-NO"));
}

export function buildMonopolyWineSeries(
  monopoly: MonopolySummary,
  wines: readonly WineSummary[],
  observedSeries: ReadonlyMap<number, readonly DailyInventory[]>,
  knownDates: readonly string[],
): MonopolyInventoryResponse["wines"] {
  const includedWineIds = new Set(observedSeries.keys());
  for (const wine of wines) {
    if (isWineRequiredAtStore(wine, monopoly)) includedWineIds.add(wine.id);
  }

  return wines
    .filter(({ id }) => includedWineIds.has(id))
    .map((wine) => ({
      wine,
      inventory: zeroFillKnownDates(observedSeries.get(wine.id) ?? [], knownDates),
    }))
    .sort((left, right) => left.wine.name.localeCompare(right.wine.name, "nb-NO"));
}

function etagSeed(
  kind: string,
  id: number,
  period: Period,
  completed: readonly CompletedInventoryDate[],
): string {
  return `${kind}:${id}:${period.from}:${period.to}:${completed.map(({ etag }) => etag).join(":")}`;
}

export async function assembleWineInventory(
  env: Env,
  wineId: number,
  period: Period,
): Promise<{ etagSeed: string; response: WineInventoryResponse }> {
  const [wines, monopolies, completed] = await Promise.all([
    getWineCatalog(env),
    getMonopolyCatalog(env),
    getCompletedDates(env.DATA_BUCKET, period),
  ]);
  const wine = wines.find(({ id }) => id === wineId);
  if (wine === undefined) throw new HttpError(404, "wine_not_found", "Wine was not found");
  const monopolyByStoreNumber = new Map(
    monopolies.map((monopoly) => [monopoly.storeNumber, monopoly]),
  );
  const series = new Map<number, DailyInventory[]>();
  const knownDates = completed.map(({ date }) => date);
  const observations = await loadInventoryObservations(env.DATA_BUCKET, knownDates, [
    wine.productNumber,
  ]);
  for (const observation of observations) {
    const monopoly = monopolyByStoreNumber.get(observation.storeId);
    if (monopoly === undefined) continue;
    const values = series.get(monopoly.id) ?? [];
    values.push({ date: observation.date, count: observation.count });
    series.set(monopoly.id, values);
  }

  const response: WineInventoryResponse = {
    ...freshnessFor(period, completed),
    wine,
    period,
    monopolies: buildWineMonopolySeries(wine, monopolies, series, knownDates),
  };
  return { response, etagSeed: etagSeed("wine", wineId, period, completed) };
}

export async function assembleMonopolyInventory(
  env: Env,
  monopolyId: number,
  period: Period,
): Promise<{ etagSeed: string; response: MonopolyInventoryResponse }> {
  const [wines, monopolies, completed] = await Promise.all([
    getWineCatalog(env),
    getMonopolyCatalog(env),
    getCompletedDates(env.DATA_BUCKET, period),
  ]);
  const monopoly = monopolies.find(({ id }) => id === monopolyId);
  if (monopoly === undefined) {
    throw new HttpError(404, "monopoly_not_found", "Monopoly was not found");
  }
  const wineByProductNumber = new Map(wines.map((wine) => [wine.productNumber, wine]));
  const series = new Map<number, DailyInventory[]>();
  const knownDates = completed.map(({ date }) => date);
  const observations = await loadInventoryObservations(
    env.DATA_BUCKET,
    knownDates,
    wines.map(({ productNumber }) => productNumber),
  );
  for (const observation of observations) {
    if (observation.storeId !== monopoly.storeNumber) continue;
    const wine = wineByProductNumber.get(observation.productId);
    if (wine === undefined) continue;
    const values = series.get(wine.id) ?? [];
    values.push({ date: observation.date, count: observation.count });
    series.set(wine.id, values);
  }

  const response: MonopolyInventoryResponse = {
    ...freshnessFor(period, completed),
    monopoly,
    period,
    wines: buildMonopolyWineSeries(monopoly, wines, series, knownDates),
  };
  return { response, etagSeed: etagSeed("monopoly", monopolyId, period, completed) };
}
