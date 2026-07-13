import { describe, expect, it, vi } from "vitest";

import { enqueueManual, enqueueScheduled } from "../src/ingestion/enqueue";

function queueEnv(send: ReturnType<typeof vi.fn>): Env {
  return { SYNC_QUEUE: { send } } as unknown as Env;
}

describe("sync queue producer", () => {
  it("enqueues exactly one manual start-sync message for the Oslo date", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(
      enqueueManual(queueEnv(send), new Date("2026-07-13T22:30:00.000Z")),
    ).resolves.toEqual({ status: "queued", date: "2026-07-14" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      {
        version: 1,
        type: "start-sync",
        trigger: "manual",
        date: "2026-07-14",
      },
      { contentType: "json" },
    );
  });

  it("uses the Cron event instant for the scheduled Oslo date", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(
      enqueueScheduled(queueEnv(send), new Date("2026-07-13T06:00:00.000Z")),
    ).resolves.toEqual({ status: "queued", date: "2026-07-13" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ trigger: "scheduled" }), {
      contentType: "json",
    });
  });
});
