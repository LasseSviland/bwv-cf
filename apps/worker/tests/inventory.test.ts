import { describe, expect, it } from "vitest";

import type { DailyInventory, MonopolySummary, WineSummary } from "@bwv/contracts";

import { buildMonopolyWineSeries, buildWineMonopolySeries } from "../src/api/inventory";

const wines: WineSummary[] = [
  {
    id: 100,
    productNumber: "100",
    name: "Core Red",
    assortment: "Basisutvalget",
    assortmentGrades: ["SB1R"],
  },
  {
    id: 200,
    productNumber: "200",
    name: "Reserve Red",
    assortment: "Basisutvalget",
    assortmentGrades: ["SB2R"],
  },
  {
    id: 300,
    productNumber: "300",
    name: "Optional Rosé",
    assortment: "Bestillingsutvalget",
    assortmentGrades: [],
  },
  {
    id: 400,
    productNumber: "400",
    name: "Unstocked Optional White",
    assortment: "Bestillingsutvalget",
    assortmentGrades: [],
  },
];

const stores: MonopolySummary[] = [
  {
    id: 10,
    storeNumber: "10",
    name: "Store One Red",
    monopolyCategory: "1",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "1R",
  },
  {
    id: 20,
    storeNumber: "20",
    name: "Store Two Red",
    monopolyCategory: "2",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "2R",
  },
];

const dates = ["2026-07-12", "2026-07-13"];

describe("detail inventory series", () => {
  it("returns missing fixed-assortment wines as zero-count sold-out rows", () => {
    const observed = new Map<number, readonly DailyInventory[]>([
      [100, [{ date: "2026-07-13", count: 4 }]],
      [300, [{ date: "2026-07-13", count: 2 }]],
    ]);

    const result = buildMonopolyWineSeries(stores[1]!, wines, observed, dates);

    expect(result.map(({ wine }) => wine.id)).toEqual([100, 300, 200]);
    expect(result.find(({ wine }) => wine.id === 200)?.inventory).toEqual([
      { date: "2026-07-12", count: 0 },
      { date: "2026-07-13", count: 0 },
    ]);
    expect(result.some(({ wine }) => wine.id === 400)).toBe(false);
  });

  it("returns missing expected stores for a wine while preserving observed additional stores", () => {
    const observed = new Map<number, readonly DailyInventory[]>([
      [10, [{ date: "2026-07-13", count: 3 }]],
    ]);

    const result = buildWineMonopolySeries(wines[1]!, stores, observed, dates);

    expect(result.map(({ monopoly }) => monopoly.id)).toEqual([10, 20]);
    expect(result.find(({ monopoly }) => monopoly.id === 20)?.inventory).toEqual([
      { date: "2026-07-12", count: 0 },
      { date: "2026-07-13", count: 0 },
    ]);
  });
});
