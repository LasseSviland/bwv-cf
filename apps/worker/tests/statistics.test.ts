import { describe, expect, it } from "vitest";

import type { MonopolySummary, WineSummary } from "@bwv/contracts";

import { calculateStockoutStatistics, isWineRequiredAtStore } from "../src/api/statistics";

const wines: WineSummary[] = [
  {
    id: 100,
    productNumber: "100",
    name: "Estate Red",
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
];

const monopolies: MonopolySummary[] = [
  {
    id: 10,
    storeNumber: "10",
    name: "Store One",
    monopolyCategory: "1",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "1R",
  },
  {
    id: 20,
    storeNumber: "20",
    name: "Store Two",
    monopolyCategory: "2",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "2R",
  },
];

describe("portfolio stockout statistics", () => {
  it("matches fixed assortment grades to store category and profile", () => {
    expect(isWineRequiredAtStore(wines[0]!, monopolies[0]!)).toBe(true);
    expect(isWineRequiredAtStore(wines[0]!, monopolies[1]!)).toBe(true);
    expect(isWineRequiredAtStore(wines[1]!, monopolies[0]!)).toBe(false);
    expect(isWineRequiredAtStore(wines[1]!, monopolies[1]!)).toBe(true);
    expect(isWineRequiredAtStore(wines[2]!, monopolies[1]!)).toBe(false);
  });

  it("counts daily pair stockouts, distinct wines and stores, transitions, and depleted bottles", () => {
    const result = calculateStockoutStatistics({
      knownDates: ["2026-07-10", "2026-07-11", "2026-07-12"],
      comparisonDate: "2026-07-09",
      wines,
      monopolies,
      observations: [
        { date: "2026-07-09", productId: "100", storeId: "10", count: 2 },
        { date: "2026-07-09", productId: "100", storeId: "20", count: 5 },
        { date: "2026-07-09", productId: "200", storeId: "20", count: 4 },
        { date: "2026-07-10", productId: "100", storeId: "10", count: 1 },
        { date: "2026-07-10", productId: "100", storeId: "20", count: 5 },
        { date: "2026-07-10", productId: "200", storeId: "20", count: 4 },
        { date: "2026-07-10", productId: "300", storeId: "10", count: 7 },
        { date: "2026-07-11", productId: "100", storeId: "20", count: 3 },
        { date: "2026-07-11", productId: "200", storeId: "20", count: 4 },
        { date: "2026-07-11", productId: "300", storeId: "10", count: 6 },
        { date: "2026-07-12", productId: "100", storeId: "10", count: 2 },
        { date: "2026-07-12", productId: "200", storeId: "20", count: 4 },
      ],
    });

    expect(result.daily).toEqual([
      {
        date: "2026-07-10",
        trackedPairs: 4,
        inStockPairs: 4,
        soldOutPairs: 0,
        distinctWinesSoldOut: 0,
        distinctStoresAffected: 0,
        newlySoldOutPairs: 0,
        bottlesLostToStockouts: 0,
        totalBottles: 17,
      },
      {
        date: "2026-07-11",
        trackedPairs: 4,
        inStockPairs: 3,
        soldOutPairs: 1,
        distinctWinesSoldOut: 1,
        distinctStoresAffected: 1,
        newlySoldOutPairs: 1,
        bottlesLostToStockouts: 1,
        totalBottles: 13,
      },
      {
        date: "2026-07-12",
        trackedPairs: 4,
        inStockPairs: 2,
        soldOutPairs: 2,
        distinctWinesSoldOut: 2,
        distinctStoresAffected: 2,
        newlySoldOutPairs: 2,
        bottlesLostToStockouts: 9,
        totalBottles: 6,
      },
    ]);
    expect(result.summary).toEqual({
      observedDays: 3,
      daysWithStockouts: 2,
      trackedPairs: 4,
      stockoutPairDays: 3,
      distinctPairsSoldOut: 3,
      distinctWinesSoldOut: 2,
      distinctStoresAffected: 2,
      newlySoldOutPairs: 3,
      bottlesLostToStockouts: 10,
      averageDailyStockouts: 1,
      availabilityRate: 0.75,
      peak: { date: "2026-07-12", soldOutPairs: 2 },
    });
  });
});
