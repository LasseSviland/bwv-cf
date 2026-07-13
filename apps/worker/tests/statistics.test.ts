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
    expect(isWineRequiredAtStore({ ...wines[0]!, outdatedAt: "2026-07-13" }, monopolies[1]!)).toBe(
      false,
    );
  });

  it("counts only fixed-assortment stockouts and reports affected wines by date", () => {
    const result = calculateStockoutStatistics({
      knownDates: ["2026-07-10", "2026-07-11", "2026-07-12"],
      comparisonDate: "2026-07-09",
      wines: [
        ...wines,
        {
          id: 400,
          productNumber: "400",
          name: "Outdated Red",
          assortment: "Basisutvalget",
          assortmentGrades: ["SB1R"],
          outdatedAt: "2026-07-13",
        },
      ],
      monopolies,
      observations: [
        { date: "2026-07-09", productId: "100", storeId: "10", count: 2 },
        { date: "2026-07-09", productId: "100", storeId: "20", count: 5 },
        { date: "2026-07-09", productId: "200", storeId: "20", count: 4 },
        { date: "2026-07-10", productId: "100", storeId: "10", count: 1 },
        { date: "2026-07-10", productId: "100", storeId: "20", count: 5 },
        { date: "2026-07-10", productId: "200", storeId: "20", count: 4 },
        { date: "2026-07-10", productId: "300", storeId: "10", count: 7 },
        { date: "2026-07-10", productId: "400", storeId: "10", count: 100 },
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
        trackedPairs: 3,
        inStockPairs: 3,
        soldOutPairs: 0,
        distinctWinesSoldOut: 0,
        distinctStoresAffected: 0,
        newlySoldOutPairs: 0,
        bottlesLostToStockouts: 0,
        totalBottles: 17,
      },
      {
        date: "2026-07-11",
        trackedPairs: 3,
        inStockPairs: 2,
        soldOutPairs: 1,
        distinctWinesSoldOut: 1,
        distinctStoresAffected: 1,
        newlySoldOutPairs: 1,
        bottlesLostToStockouts: 1,
        totalBottles: 13,
      },
      {
        date: "2026-07-12",
        trackedPairs: 3,
        inStockPairs: 2,
        soldOutPairs: 1,
        distinctWinesSoldOut: 1,
        distinctStoresAffected: 1,
        newlySoldOutPairs: 1,
        bottlesLostToStockouts: 3,
        totalBottles: 6,
      },
    ]);
    expect(result.wines).toEqual([
      {
        wine: wines[0],
        fixedStores: 2,
        soldOutDays: 2,
        storeDaysSoldOut: 2,
        currentStoresSoldOut: 1,
        availabilityRate: 2 / 3,
        peak: { date: "2026-07-11", storesSoldOut: 1 },
        soldOutDates: [
          { date: "2026-07-11", storesSoldOut: 1 },
          { date: "2026-07-12", storesSoldOut: 1 },
        ],
      },
    ]);
    expect(result.summary).toEqual({
      observedDays: 3,
      daysWithStockouts: 2,
      trackedPairs: 3,
      stockoutPairDays: 2,
      distinctPairsSoldOut: 2,
      distinctWinesSoldOut: 1,
      distinctStoresAffected: 2,
      newlySoldOutPairs: 2,
      bottlesLostToStockouts: 4,
      averageDailyStockouts: 2 / 3,
      availabilityRate: 7 / 9,
      peak: { date: "2026-07-11", soldOutPairs: 1 },
    });
  });

  it("does not change a day's result when optional stock appears elsewhere in the period", () => {
    const observations = [
      { date: "2026-07-11", productId: "100", storeId: "20", count: 3 },
      { date: "2026-07-11", productId: "200", storeId: "20", count: 4 },
      { date: "2026-07-11", productId: "300", storeId: "10", count: 6 },
      { date: "2026-07-12", productId: "100", storeId: "10", count: 2 },
      { date: "2026-07-12", productId: "200", storeId: "20", count: 4 },
    ];
    const short = calculateStockoutStatistics({
      knownDates: ["2026-07-12"],
      comparisonDate: "2026-07-11",
      wines,
      monopolies,
      observations,
    });
    const long = calculateStockoutStatistics({
      knownDates: ["2026-07-11", "2026-07-12"],
      comparisonDate: null,
      wines,
      monopolies,
      observations,
    });

    expect(long.daily[1]).toEqual(short.daily[0]);
    expect(short.daily[0]?.trackedPairs).toBe(3);
  });

  it("does not track a fixed placement before its assortment becomes valid", () => {
    const result = calculateStockoutStatistics({
      knownDates: ["2026-07-10", "2026-07-11"],
      comparisonDate: null,
      wines: [wines[0]!],
      monopolies,
      observations: [],
      fixedAssortmentFromByWineId: new Map([[100, "2026-07-11"]]),
    });

    expect(
      result.daily.map(({ trackedPairs, soldOutPairs }) => ({ trackedPairs, soldOutPairs })),
    ).toEqual([
      { trackedPairs: 0, soldOutPairs: 0 },
      { trackedPairs: 2, soldOutPairs: 2 },
    ]);
  });
});
