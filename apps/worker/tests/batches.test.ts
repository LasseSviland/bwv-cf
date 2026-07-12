import { describe, expect, it } from "vitest";

import { processInBatches } from "../src/ingestion/batches";

describe("bounded async batches", () => {
  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let maximum = 0;
    const completed: number[] = [];
    await processInBatches([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      completed.push(item);
      active -= 1;
    });
    expect(maximum).toBe(3);
    expect(completed.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("rejects invalid batch sizes", async () => {
    await expect(processInBatches([], 0, () => Promise.resolve())).rejects.toThrow("batchSize");
  });
});
