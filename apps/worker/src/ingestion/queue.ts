import { SyncQueueMessageSchema, type SyncQueueMessage } from "@bwv/contracts";
import { dateInOslo } from "@bwv/data-format";

import { errorMessage, isPermanentQueueError } from "../errors";
import { logError, logInfo } from "../log";
import { dailyInventoryKey } from "../storage/keys";
import { objectExists, putJsonIfAbsent } from "../storage/r2";
import type { DailyInventoryFile, QueueProcessResult } from "../types";
import { syncMonopolies, syncWines } from "./catalogs";
import { fetchAllWineInventory, type FetchFunction } from "./vinmonopolet";

export const MAX_QUEUE_DELIVERIES = 6;

export function queueRetryDelay(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 7));
  return Math.min(30 * 2 ** exponent, 3_600);
}

export function queueDeliveryExhausted(attempts: number): boolean {
  return attempts >= MAX_QUEUE_DELIVERIES;
}

export async function processQueueMessage(
  message: SyncQueueMessage,
  env: Env,
  fetchFn: FetchFunction = fetch,
  now: () => Date = () => new Date(),
): Promise<QueueProcessResult> {
  const syncInstant = now();
  const syncedAt = syncInstant.toISOString();
  const detectedAt = dateInOslo(syncInstant);

  // Product details are refreshed first so every later step uses the merged catalog.
  const wineFile = await syncWines(env, syncedAt, detectedAt, fetchFn);

  // Store details are merged for the same reason: changed/new records win and removed stores remain.
  const monopolyFile = await syncMonopolies(env, syncedAt, fetchFn);

  const inventoryKey = dailyInventoryKey(message.date);
  if (await objectExists(env, inventoryKey)) {
    return {
      outcome: "skipped",
      detail: `Merged ${wineFile.wines.length} wines and ${monopolyFile.monopolies.length} monopolies; inventory already exists`,
    };
  }

  const inventory = await fetchAllWineInventory(env.VINMONOPOLET_RESTRICTED_API_KEY, fetchFn);
  const inventoryFile: DailyInventoryFile = {
    schemaVersion: 1,
    syncedAt,
    date: message.date,
    source: "vinmonopolet/my-products/v1/stock-per-store",
    products: inventory,
  };
  const stored = await putJsonIfAbsent(env, inventoryKey, inventoryFile);
  if (!stored) {
    return {
      outcome: "skipped",
      detail: `Merged ${wineFile.wines.length} wines and ${monopolyFile.monopolies.length} monopolies; inventory was stored by another delivery`,
    };
  }
  return {
    outcome: "completed",
    detail: `Merged ${wineFile.wines.length} wines and ${monopolyFile.monopolies.length} monopolies; stored ${inventory.length} inventory products`,
  };
}

export async function handleQueueBatch(
  batch: MessageBatch<SyncQueueMessage>,
  env: Env,
): Promise<void> {
  for (const queueMessage of batch.messages) {
    const parsed = SyncQueueMessageSchema.safeParse(queueMessage.body);
    if (!parsed.success) {
      logError("Rejected invalid sync queue message", {
        queueMessageId: queueMessage.id,
        attempts: queueMessage.attempts,
        error: parsed.error.message,
      });
      queueMessage.ack();
      continue;
    }

    try {
      const result = await processQueueMessage(parsed.data, env);
      logInfo("Processed sync queue message", {
        queueMessageId: queueMessage.id,
        trigger: parsed.data.trigger,
        date: parsed.data.date,
        outcome: result.outcome,
        detail: result.detail,
      });
      queueMessage.ack();
    } catch (error) {
      const permanent = isPermanentQueueError(error);
      const exhausted = queueDeliveryExhausted(queueMessage.attempts);
      logError("Sync queue message failed", {
        queueMessageId: queueMessage.id,
        trigger: parsed.data.trigger,
        date: parsed.data.date,
        attempts: queueMessage.attempts,
        permanent,
        exhausted,
        error: errorMessage(error),
      });
      if (permanent) queueMessage.ack();
      else queueMessage.retry({ delaySeconds: queueRetryDelay(queueMessage.attempts) });
    }
  }
}
