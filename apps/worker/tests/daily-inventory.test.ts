import { describe, expect, it, vi } from "vitest";

import { loadDailyInventory } from "../src/api/daily-inventory";
import type { DailyInventorySnapshot, PublishedMonthRow } from "../src/types";

async function gzip(value: object): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function publishedMonth(): PublishedMonthRow {
  return {
    month: "2026-07",
    generation: "gen",
    manifestKey: "d1:published-months/2026-07",
    generatedAt: "2026-07-12T08:00:00Z",
    coveredFrom: "2026-07-01",
    coveredThrough: "2026-07-02",
    sourceFloorId: 1,
    sourceWatermark: 10,
    sourceRowCount: 2,
    inventoryObjectCount: 2,
    etag: "gen",
    publishedAt: "2026-07-12T08:00:01Z",
  };
}

describe("daily inventory loading", () => {
  it("loads exactly one gzip object for each covered date", async () => {
    const snapshots: DailyInventorySnapshot[] = [
      {
        schemaVersion: 2,
        date: "2026-07-01",
        generation: "gen",
        inventory: [{ wineId: 1, monopolyId: 10, count: 4 }],
      },
      { schemaVersion: 2, date: "2026-07-02", generation: "gen", inventory: [] },
    ];
    const compressed = new Map(
      await Promise.all(
        snapshots.map(async (snapshot) => [snapshot.date, await gzip(snapshot)] as const),
      ),
    );
    const get = vi.fn((key: string) => {
      const date = key.slice(-18, -8);
      const bytes = compressed.get(date);
      return Promise.resolve(
        bytes === undefined
          ? null
          : ({ body: new Blob([bytes]).stream() } as unknown as R2ObjectBody),
      );
    });
    const bucket = { get } as unknown as R2Bucket;

    await expect(
      loadDailyInventory(bucket, { from: "2026-07-01", to: "2026-07-02" }, [publishedMonth()]),
    ).resolves.toEqual(snapshots);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([key]) => key)).toEqual([
      "datasets/v1/month=2026-07/generation=gen/inventory/2026-07-01.json.gz",
      "datasets/v1/month=2026-07/generation=gen/inventory/2026-07-02.json.gz",
    ]);
  });
});
