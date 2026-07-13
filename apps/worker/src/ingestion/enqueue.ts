import type { AdminAcceptedResponse, SyncQueueMessage, SyncTrigger } from "@bwv/contracts";
import { dateInOslo } from "@bwv/data-format";

export async function enqueueSync(
  env: Env,
  trigger: SyncTrigger,
  instant = new Date(),
): Promise<AdminAcceptedResponse> {
  const date = dateInOslo(instant);
  const message: SyncQueueMessage = {
    version: 1,
    type: "start-sync",
    trigger,
    date,
  };
  await env.SYNC_QUEUE.send(message, { contentType: "json" });
  return { status: "queued", date };
}

export function enqueueManual(env: Env, instant = new Date()): Promise<AdminAcceptedResponse> {
  return enqueueSync(env, "manual", instant);
}

export function enqueueScheduled(env: Env, instant: Date): Promise<AdminAcceptedResponse> {
  return enqueueSync(env, "scheduled", instant);
}
