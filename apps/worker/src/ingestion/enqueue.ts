import type { AdminAcceptedResponse, Month, SyncQueueMessage, SyncTrigger } from "@bwv/contracts";
import {
  currentAndPreviousMonthsInOslo,
  currentMonthInOslo,
  enumerateMonths,
} from "@bwv/data-format";

import { createSyncRun, markCoordinatorFailed, type NewMonthSync } from "../storage/d1";

const FIRST_HISTORIC_MONTH: Month = "2024-01";

function newMonthSyncs(months: readonly Month[]): NewMonthSync[] {
  return months.map((month) => ({ month, generation: crypto.randomUUID() }));
}

async function sendMessages(env: Env, messages: SyncQueueMessage[]): Promise<void> {
  await env.SYNC_QUEUE.sendBatch(messages.map((body) => ({ body, contentType: "json" as const })));
}

export async function enqueueMonths(
  env: Env,
  trigger: SyncTrigger,
  months: readonly Month[],
): Promise<AdminAcceptedResponse> {
  const orderedMonths = [...new Set(months)].sort();
  const firstMonth = orderedMonths[0];
  if (firstMonth === undefined) throw new RangeError("At least one sync month is required");
  const monthSyncs = newMonthSyncs(orderedMonths);
  const firstSync = monthSyncs[0];
  if (firstSync === undefined) throw new RangeError("At least one sync month is required");
  const jobId = crypto.randomUUID();
  const queuedSyncs = await createSyncRun(env.DB, jobId, trigger, monthSyncs, "extract");
  const coordinatorSync = queuedSyncs[0];
  if (coordinatorSync === undefined) {
    return { jobId, status: "queued", months: orderedMonths };
  }

  try {
    await sendMessages(env, [
      {
        version: 1,
        jobId,
        trigger,
        month: coordinatorSync.month,
        generation: coordinatorSync.generation,
        phase: "refresh-catalogs",
      },
    ]);
  } catch (error) {
    await markCoordinatorFailed(env.DB, jobId, "Failed to enqueue the catalog coordinator");
    throw error;
  }
  return { jobId, status: "queued", months: orderedMonths };
}

export async function enqueueBackfill(
  env: Env,
  fromMonth: Month = FIRST_HISTORIC_MONTH,
  throughMonth: Month = currentMonthInOslo(),
  trigger: SyncTrigger = "backfill",
): Promise<AdminAcceptedResponse> {
  const months = enumerateMonths(fromMonth, throughMonth, 100);
  const monthSyncs = newMonthSyncs(months);
  const firstSync = monthSyncs[0];
  if (firstSync === undefined) throw new RangeError("Backfill requires at least one month");
  const jobId = crypto.randomUUID();
  const queuedSyncs = await createSyncRun(env.DB, jobId, trigger, monthSyncs, "bootstrap-bounds");
  const coordinatorSync = queuedSyncs[0];
  if (coordinatorSync === undefined) {
    return { jobId, status: "queued", months };
  }

  const coordinator: SyncQueueMessage = {
    version: 1,
    jobId,
    trigger,
    month: coordinatorSync.month,
    generation: coordinatorSync.generation,
    phase: "bootstrap-bounds",
    fromMonth,
    throughMonth,
  };
  try {
    await env.SYNC_QUEUE.send(coordinator, { contentType: "json" });
  } catch (error) {
    await markCoordinatorFailed(env.DB, jobId, "Failed to enqueue the backfill coordinator");
    throw error;
  }
  return { jobId, status: "queued", months };
}

export async function enqueueRefresh(env: Env): Promise<AdminAcceptedResponse> {
  return enqueueMonths(env, "manual", currentAndPreviousMonthsInOslo());
}

export async function enqueueScheduled(env: Env, instant: Date): Promise<AdminAcceptedResponse> {
  return enqueueMonths(env, "scheduled", currentAndPreviousMonthsInOslo(instant));
}

export { FIRST_HISTORIC_MONTH };
