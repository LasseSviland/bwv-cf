import { describe, expect, it } from "vitest";

import type { RawInventoryChunk } from "../src/types";
import {
  buildMonopolyProjections,
  buildWineProjections,
  parseRawInventoryChunk,
  projectionBucket,
} from "../src/ingestion/projections";

function chunk(rows: RawInventoryChunk["rows"]): RawInventoryChunk {
  return {
    schemaVersion: 1,
    month: "2026-07",
    generation: "gen",
    cursorFrom: 0,
    cursorThrough: 10,
    rows,
  };
}

const wineIds = new Set([1, 2]);
const monopolyIds = new Set([10, 11]);

describe("monthly projections", () => {
  it("keeps the highest-id duplicate and removes a later zero observation", () => {
    const rows = chunk([
      { id: 1, date: 20260701, count: 5, wineId: 1, monopolyId: 10 },
      { id: 2, date: 20260701, count: 0, wineId: 1, monopolyId: 10 },
      { id: 3, date: 20260702, count: 4, wineId: 1, monopolyId: 10 },
    ]);
    const projections = buildWineProjections(
      [rows],
      "2026-07",
      projectionBucket(1),
      wineIds,
      monopolyIds,
    );
    expect(projections).toEqual([
      {
        schemaVersion: 1,
        month: "2026-07",
        wineId: 1,
        monopolies: [{ monopolyId: 10, inventory: [{ date: "2026-07-02", count: 4 }] }],
      },
    ]);
  });

  it("builds the symmetric monopoly projection", () => {
    const rows = chunk([
      { id: 1, date: 20260701, count: 2, wineId: 1, monopolyId: 10 },
      { id: 2, date: 20260701, count: 3, wineId: 2, monopolyId: 10 },
    ]);
    const projections = buildMonopolyProjections(
      [rows],
      "2026-07",
      projectionBucket(10),
      wineIds,
      monopolyIds,
    );
    expect(projections[0]?.wines.map(({ wineId }) => wineId)).toEqual([1, 2]);
  });

  it("excludes wines outside the Better Wines catalog and still rejects orphan stores", () => {
    const otherImporter = chunk([{ id: 1, date: 20260701, count: 2, wineId: 999, monopolyId: 10 }]);
    expect(
      buildWineProjections([otherImporter], "2026-07", projectionBucket(999), wineIds, monopolyIds),
    ).toEqual([]);

    const orphanStore = chunk([{ id: 1, date: 20260701, count: 2, wineId: 1, monopolyId: 999 }]);
    expect(() =>
      buildWineProjections([orphanStore], "2026-07", projectionBucket(1), wineIds, monopolyIds),
    ).toThrow("Orphan inventory monopoly_id 999");
  });

  it("rejects negative raw counts before projection", () => {
    expect(() =>
      parseRawInventoryChunk({
        ...chunk([]),
        rows: [{ id: 1, date: 20260701, count: -1, wineId: 1, monopolyId: 10 }],
      }),
    ).toThrow();
  });
});
