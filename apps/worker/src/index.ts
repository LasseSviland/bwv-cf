import type { SyncQueueMessage } from "@bwv/contracts";

import app from "./api/app";
import { enqueueScheduled } from "./ingestion/enqueue";
import { handleQueueBatch } from "./ingestion/queue";
import { logError, logInfo } from "./log";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime);
    try {
      const result = await enqueueScheduled(env, scheduledAt);
      logInfo("Scheduled sync enqueued", {
        date: result.date,
        scheduledAt: scheduledAt.toISOString(),
      });
    } catch (error) {
      logError("Failed to enqueue scheduled sync", {
        scheduledAt: scheduledAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async queue(batch, env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
} satisfies ExportedHandler<Env, SyncQueueMessage>;
