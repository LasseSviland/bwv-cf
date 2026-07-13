import type { Period } from "@bwv/contracts";
import { enumerateDates } from "@bwv/data-format";

import { HttpError } from "../errors";
import { DailyInventorySnapshotSchema } from "../ingestion/projections";
import { dailyInventoryKey } from "../storage/keys";
import { getRequiredGzipJson } from "../storage/r2";
import type { DailyInventorySnapshot, PublishedMonthRow } from "../types";

const READ_BATCH_SIZE = 20;

export function coveredDates(period: Period, published: readonly PublishedMonthRow[]): string[] {
  const byMonth = new Map(published.map((row) => [row.month, row]));
  return enumerateDates(period.from, period.to, 366).filter((date) => {
    const row = byMonth.get(date.slice(0, 7));
    return row !== undefined && date >= row.coveredFrom && date <= row.coveredThrough;
  });
}

export async function loadDailyInventory(
  bucket: R2Bucket,
  period: Period,
  published: readonly PublishedMonthRow[],
): Promise<DailyInventorySnapshot[]> {
  const generationByMonth = new Map(published.map((row) => [row.month, row.generation]));
  const dates = coveredDates(period, published);
  const snapshots: DailyInventorySnapshot[] = [];
  for (let offset = 0; offset < dates.length; offset += READ_BATCH_SIZE) {
    const batch = dates.slice(offset, offset + READ_BATCH_SIZE);
    snapshots.push(
      ...(await Promise.all(
        batch.map(async (date) => {
          const generation = generationByMonth.get(date.slice(0, 7));
          if (generation === undefined) {
            throw new HttpError(503, "dataset_invalid", `No generation exists for ${date}`);
          }
          const snapshot = await getRequiredGzipJson(
            bucket,
            dailyInventoryKey(date, generation),
            (value) => DailyInventorySnapshotSchema.parse(value),
          );
          if (snapshot.date !== date || snapshot.generation !== generation) {
            throw new HttpError(503, "dataset_invalid", `Inventory snapshot mismatch for ${date}`);
          }
          return snapshot;
        }),
      )),
    );
  }
  return snapshots;
}
