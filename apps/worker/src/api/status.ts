import type { Freshness, StatusResponse } from "@bwv/contracts";
import { currentMonthInOslo, enumerateMonths } from "@bwv/data-format";

import { activeWineSources } from "../ingestion/catalogs";
import { MONOPOLIES_KEY, WINES_KEY } from "../storage/keys";
import {
  getOptionalJson,
  listCompletedInventoryDates,
  parseMonopolyCatalogFile,
  parseWineCatalogFile,
} from "../storage/r2";

export async function getStatus(env: Env): Promise<StatusResponse> {
  const [completed, wines, monopolies] = await Promise.all([
    listCompletedInventoryDates(env.DATA_BUCKET),
    getOptionalJson(env.DATA_BUCKET, WINES_KEY, parseWineCatalogFile),
    getOptionalJson(env.DATA_BUCKET, MONOPOLIES_KEY, parseMonopolyCatalogFile),
  ]);
  const catalog = {
    wines: wines === null ? 0 : activeWineSources(wines).length,
    monopolies: monopolies?.monopolies.length ?? 0,
  };
  if (completed.length === 0) return { freshness: null, availableMonths: [], catalog };

  const availableMonths = [...new Set(completed.map(({ date }) => date.slice(0, 7)))].sort();
  const firstMonth = availableMonths[0];
  const latest = completed.at(-1);
  if (firstMonth === undefined || latest === undefined) {
    return { freshness: null, availableMonths: [], catalog };
  }
  const available = new Set(availableMonths);
  const missingMonths = enumerateMonths(firstMonth, currentMonthInOslo(), 1_200).filter(
    (month) => !available.has(month),
  );
  const freshness: Freshness = {
    datasetGeneratedAt: latest.uploaded.toISOString(),
    sourceWatermark: latest.uploaded.getTime(),
    coveredThrough: latest.date,
    availableDates: completed.map(({ date }) => date),
    ...(missingMonths.length > 0 ? { missingMonths } : {}),
  };
  return { freshness, availableMonths, catalog };
}
