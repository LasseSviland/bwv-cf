import { describe, expect, it } from "vitest";

import type { SyncQueueMessage } from "@bwv/contracts";

import {
  coveredThroughForPublish,
  initialExtractionCursor,
  nextExtractionMessage,
  nextInventoryContinuation,
  queueDeliveryExhausted,
  queueRetryDelay,
  queueStepKey,
} from "../src/ingestion/queue";

const base: Omit<SyncQueueMessage, "phase"> = {
  version: 1,
  jobId: "job",
  trigger: "manual",
  month: "2026-07",
  generation: "generation",
};

describe("queue idempotency helpers", () => {
  it("uses a deterministic key for every continuation phase", () => {
    expect(queueStepKey({ ...base, phase: "extract" })).toBe("cursor:start");
    expect(queueStepKey({ ...base, phase: "extract", cursorId: 5000 })).toBe("cursor:5000");
    expect(queueStepKey({ ...base, phase: "project-inventory", date: "2026-07-03" })).toBe(
      "date:2026-07-03",
    );
    expect(queueStepKey({ ...base, phase: "publish" })).toBe("publish");
    expect(queueStepKey({ ...base, phase: "refresh-catalogs" })).toBe("catalog:generation");
    expect(
      queueStepKey({
        ...base,
        phase: "bootstrap-bounds",
        fromMonth: "2026-01",
        throughMonth: "2026-07",
      }),
    ).toBe("2026-01:2026-07");
    expect(
      queueStepKey({
        ...base,
        phase: "reset",
        fromMonth: "2026-01",
        throughMonth: "2026-07",
      }),
    ).toBe("2026-01:2026-07");
  });

  it("backs off transient failures with a cap", () => {
    expect(queueRetryDelay(1)).toBe(30);
    expect(queueRetryDelay(2)).toBe(60);
    expect(queueRetryDelay(6)).toBe(960);
    expect(queueRetryDelay(99)).toBe(3_600);
    expect(queueDeliveryExhausted(5)).toBe(false);
    expect(queueDeliveryExhausted(6)).toBe(true);
  });

  it("starts each rebuild with a conservative primary-key overlap", () => {
    expect(initialExtractionCursor(50_000)).toBe(39_999);
    expect(initialExtractionCursor(5_000)).toBe(0);
  });

  it("derives a continuation from the persisted extraction checkpoint", () => {
    expect(nextExtractionMessage({ ...base, phase: "extract" }, 1_000, 2_000)).toMatchObject({
      phase: "extract",
      cursorId: 1_000,
      ceilingId: 2_000,
    });
    expect(nextExtractionMessage({ ...base, phase: "extract" }, 2_000, 2_000)).toMatchObject({
      phase: "project-inventory",
      date: "2026-07-01",
    });
  });

  it("advances one daily object at a time and publishes after the covered date", () => {
    expect(
      nextInventoryContinuation(
        { ...base, phase: "project-inventory", date: "2026-07-10" },
        "2026-07-11",
      ),
    ).toMatchObject({ phase: "project-inventory", date: "2026-07-11" });
    expect(
      nextInventoryContinuation(
        { ...base, phase: "project-inventory", date: "2026-07-11" },
        "2026-07-11",
      ),
    ).toMatchObject({ phase: "publish" });
  });

  it("does not claim current-month coverage after the newest source observation", () => {
    expect(coveredThroughForPublish("2026-07", "2026-07-11", "2026-07-12")).toBe("2026-07-11");
    expect(coveredThroughForPublish("2026-06", "2026-06-25", "2026-07-12")).toBe("2026-06-30");
    expect(() => coveredThroughForPublish("2026-07", null, "2026-07-12")).toThrow(
      "no source observation",
    );
  });
});
