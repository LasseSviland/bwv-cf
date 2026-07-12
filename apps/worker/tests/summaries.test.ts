import { describe, expect, it, vi } from "vitest";

import { readWineProjectionEntries, summarizeAvailability } from "../src/api/summaries";

describe("catalog availability summaries", () => {
  it("counts tracked relations that sold out, had stock, and have current stock", () => {
    const result = summarizeAvailability(
      [
        {
          relatedId: 1,
          inventory: [
            { date: "2026-07-10", count: 2 },
            { date: "2026-07-12", count: 3 },
          ],
        },
        { relatedId: 1, inventory: [{ date: "2026-07-11", count: 4 }] },
        { relatedId: 2, inventory: [{ date: "2026-07-10", count: 5 }] },
        { relatedId: 3, inventory: [] },
        {
          relatedId: 999,
          inventory: [
            { date: "2026-07-10", count: 100 },
            { date: "2026-07-11", count: 100 },
            { date: "2026-07-12", count: 100 },
          ],
        },
      ],
      ["2026-07-10", "2026-07-11", "2026-07-12"],
      new Set([1, 2, 3]),
    );

    expect(result).toEqual({
      soldOutAtSomePoint: 2,
      inStockAtSomePoint: 2,
      currentlyInStock: 1,
      bottlesByDate: [
        { date: "2026-07-10", count: 7 },
        { date: "2026-07-11", count: 4 },
        { date: "2026-07-12", count: 3 },
      ],
    });
  });

  it("ignores observations outside source coverage", () => {
    expect(
      summarizeAvailability(
        [
          {
            relatedId: 1,
            inventory: [
              { date: "2026-07-11", count: 6 },
              { date: "2026-07-12", count: 9 },
            ],
          },
        ],
        ["2026-07-11"],
      ),
    ).toEqual({
      soldOutAtSomePoint: 0,
      inStockAtSomePoint: 1,
      currentlyInStock: 1,
      bottlesByDate: [{ date: "2026-07-11", count: 6 }],
    });
  });

  it("starts every required monthly projection read before awaiting any result", async () => {
    const resolvers: Array<(value: R2ObjectBody | null) => void> = [];
    const get = vi.fn(
      () =>
        new Promise<R2ObjectBody | null>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const bucket = {
      get,
    } as unknown as R2Bucket;

    const entriesPromise = readWineProjectionEntries(
      bucket,
      [
        { month: "2026-06", generation: "june" },
        { month: "2026-07", generation: "july" },
      ],
      42,
      { from: "2026-06-01", to: "2026-07-31" },
    );

    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(2);

    resolvers[0]?.({
      json: () =>
        Promise.resolve({
          schemaVersion: 1,
          month: "2026-06",
          wineId: 42,
          monopolies: [{ monopolyId: 1, inventory: [{ date: "2026-06-01", count: 3 }] }],
        }),
    } as R2ObjectBody);
    resolvers[1]?.({
      json: () =>
        Promise.resolve({
          schemaVersion: 1,
          month: "2026-07",
          wineId: 42,
          monopolies: [{ monopolyId: 2, inventory: [{ date: "2026-07-01", count: 4 }] }],
        }),
    } as R2ObjectBody);

    await expect(entriesPromise).resolves.toEqual([
      { relatedId: 1, inventory: [{ date: "2026-06-01", count: 3 }] },
      { relatedId: 2, inventory: [{ date: "2026-07-01", count: 4 }] },
    ]);
  });
});
