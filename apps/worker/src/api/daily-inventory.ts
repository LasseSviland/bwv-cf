import type { Period } from "@bwv/contracts";

import { HttpError } from "../errors";
import { nestedArray, nestedNumber, nestedString } from "../ingestion/vinmonopolet";
import { dailyInventoryKey } from "../storage/keys";
import {
  getOptionalJson,
  listCompletedInventoryDates,
  parseDailyInventoryFile,
  parseJsonObject,
} from "../storage/r2";
import type { CompletedInventoryDate } from "../types";

const READ_BATCH_SIZE = 25;

export interface InventoryObservation {
  date: string;
  productId: string;
  storeId: string;
  count: number;
}

export function completedDatesForPeriod(
  period: Period,
  completed: readonly CompletedInventoryDate[],
): CompletedInventoryDate[] {
  return completed.filter(({ date }) => date >= period.from && date <= period.to);
}

export async function getCompletedDates(
  bucket: R2Bucket,
  period?: Period,
): Promise<CompletedInventoryDate[]> {
  const completed = await listCompletedInventoryDates(bucket);
  return period === undefined ? completed : completedDatesForPeriod(period, completed);
}

export async function loadInventoryObservations(
  bucket: R2Bucket,
  dates: readonly string[],
  productIds: readonly string[],
): Promise<InventoryObservation[]> {
  const requestedProductIds = new Set(productIds);
  const observations: InventoryObservation[] = [];

  for (let offset = 0; offset < dates.length; offset += READ_BATCH_SIZE) {
    const batch = dates.slice(offset, offset + READ_BATCH_SIZE);
    const files = await Promise.all(
      batch.map((date) =>
        getOptionalJson(bucket, dailyInventoryKey(date), parseDailyInventoryFile),
      ),
    );
    files.forEach((file, index) => {
      if (file === null) return;
      const expectedDate = batch[index];
      if (expectedDate === undefined || file.date !== expectedDate) {
        throw new HttpError(503, "dataset_invalid", "Inventory file identity is invalid");
      }
      for (const product of file.products) {
        const productId = nestedString(product, "productId");
        if (productId === null) {
          throw new HttpError(503, "dataset_invalid", "Inventory response product is invalid");
        }
        if (!requestedProductIds.has(productId)) continue;
        for (const [stockIndex, value] of nestedArray(product, "stock").entries()) {
          const stock = parseJsonObject(value, `Inventory stock[${stockIndex}]`);
          const storeId = nestedString(stock, "storeId");
          const count = nestedNumber(stock, "storeStock");
          if (storeId === null || count === null || !Number.isSafeInteger(count) || count < 0) {
            throw new HttpError(503, "dataset_invalid", "Inventory stock row is invalid");
          }
          if (count > 0) {
            observations.push({ date: file.date, productId, storeId, count });
          }
        }
      }
    });
  }
  return observations;
}
