import { describe, expect, it } from "vitest";

import type { RawInventoryChunk } from "../src/types";
import { buildDailyInventorySnapshot, parseRawInventoryChunk } from "../src/ingestion/projections";

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

describe("daily inventory snapshots", () => {
  it("stores every positive inventory relation for one date in one snapshot", () => {
    const snapshot = buildDailyInventorySnapshot(
      [
        chunk([
          { id: 1, date: 20260701, count: 5, wineId: 1, monopolyId: 10 },
          { id: 2, date: 20260701, count: 3, wineId: 2, monopolyId: 10 },
          { id: 3, date: 20260702, count: 4, wineId: 1, monopolyId: 11 },
        ]),
      ],
      "2026-07-01",
      "gen",
      wineIds,
      monopolyIds,
    );
    expect(snapshot).toEqual({
      schemaVersion: 2,
      date: "2026-07-01",
      generation: "gen",
      inventory: [
        { wineId: 1, monopolyId: 10, count: 5 },
        { wineId: 2, monopolyId: 10, count: 3 },
      ],
    });
  });

  it("keeps the highest-id duplicate and removes a later zero observation", () => {
    const snapshot = buildDailyInventorySnapshot(
      [
        chunk([
          { id: 1, date: 20260701, count: 5, wineId: 1, monopolyId: 10 },
          { id: 2, date: 20260701, count: 0, wineId: 1, monopolyId: 10 },
        ]),
      ],
      "2026-07-01",
      "gen",
      wineIds,
      monopolyIds,
    );
    expect(snapshot.inventory).toEqual([]);
  });

  it("excludes other importers and rejects orphan stores", () => {
    expect(
      buildDailyInventorySnapshot(
        [chunk([{ id: 1, date: 20260701, count: 2, wineId: 999, monopolyId: 10 }])],
        "2026-07-01",
        "gen",
        wineIds,
        monopolyIds,
      ).inventory,
    ).toEqual([]);
    expect(() =>
      buildDailyInventorySnapshot(
        [chunk([{ id: 1, date: 20260701, count: 2, wineId: 1, monopolyId: 999 }])],
        "2026-07-01",
        "gen",
        wineIds,
        monopolyIds,
      ),
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
