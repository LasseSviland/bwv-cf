import type { Freshness, StatusResponse } from "@bwv/contracts";
import { currentMonthInOslo, enumerateMonths } from "@bwv/data-format";

import { FIRST_HISTORIC_MONTH } from "../ingestion/enqueue";
import { listPublishedMonths } from "../storage/d1";

export async function getStatus(env: Env): Promise<StatusResponse> {
  const published = await listPublishedMonths(env.DB);
  if (published.length === 0) return { freshness: null, availableMonths: [] };

  const availableMonths = published.map(({ month }) => month);
  const available = new Set(availableMonths);
  const missingMonths = enumerateMonths(FIRST_HISTORIC_MONTH, currentMonthInOslo(), 100).filter(
    (month) => !available.has(month),
  );
  const latest = published.at(-1);
  if (latest === undefined) return { freshness: null, availableMonths: [] };
  const freshness: Freshness = {
    datasetGeneratedAt: latest.generatedAt,
    sourceWatermark: latest.sourceWatermark,
    coveredThrough: latest.coveredThrough,
    ...(missingMonths.length > 0 ? { missingMonths } : {}),
  };
  return { freshness, availableMonths };
}
