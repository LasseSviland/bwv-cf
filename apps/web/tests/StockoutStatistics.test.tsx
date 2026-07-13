import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { StatisticsResponse } from "../src/api/types";
import { StockoutStatistics } from "../src/components/StockoutStatistics";

const statistics: StatisticsResponse = {
  datasetGeneratedAt: "2026-07-12T08:00:00Z",
  sourceWatermark: 900,
  coveredThrough: "2026-07-12",
  availableDates: ["2026-07-11", "2026-07-12"],
  period: { from: "2026-07-11", to: "2026-07-12" },
  comparisonDate: "2026-07-10",
  daily: [
    {
      date: "2026-07-11",
      trackedPairs: 20,
      inStockPairs: 18,
      soldOutPairs: 2,
      distinctWinesSoldOut: 1,
      distinctStoresAffected: 2,
      newlySoldOutPairs: 1,
      bottlesLostToStockouts: 3,
      totalBottles: 94,
    },
    {
      date: "2026-07-12",
      trackedPairs: 20,
      inStockPairs: 17,
      soldOutPairs: 3,
      distinctWinesSoldOut: 2,
      distinctStoresAffected: 2,
      newlySoldOutPairs: 2,
      bottlesLostToStockouts: 4,
      totalBottles: 88,
    },
  ],
  wines: [
    {
      wine: {
        id: 100,
        productNumber: "100",
        name: "Estate Red",
        assortment: "Basisutvalget",
        assortmentGrades: ["SB1R"],
      },
      fixedStores: 10,
      soldOutDays: 2,
      storeDaysSoldOut: 4,
      currentStoresSoldOut: 2,
      availabilityRate: 0.8,
      peak: { date: "2026-07-11", storesSoldOut: 2 },
      soldOutDates: [
        { date: "2026-07-11", storesSoldOut: 2 },
        { date: "2026-07-12", storesSoldOut: 2 },
      ],
    },
    {
      wine: {
        id: 200,
        productNumber: "200",
        name: "Reserve Red",
        assortment: "Basisutvalget",
        assortmentGrades: ["SB2R"],
      },
      fixedStores: 10,
      soldOutDays: 1,
      storeDaysSoldOut: 1,
      currentStoresSoldOut: 1,
      availabilityRate: 0.95,
      peak: { date: "2026-07-12", storesSoldOut: 1 },
      soldOutDates: [{ date: "2026-07-12", storesSoldOut: 1 }],
    },
  ],
  summary: {
    observedDays: 2,
    daysWithStockouts: 2,
    trackedPairs: 20,
    stockoutPairDays: 5,
    distinctPairsSoldOut: 4,
    distinctWinesSoldOut: 2,
    distinctStoresAffected: 3,
    newlySoldOutPairs: 3,
    bottlesLostToStockouts: 7,
    averageDailyStockouts: 2.5,
    availabilityRate: 0.875,
    peak: { date: "2026-07-12", soldOutPairs: 3 },
  },
};

describe("StockoutStatistics", () => {
  it("shows fixed-assortment metrics, multiple daily charts, wines, and exact dates", () => {
    render(
      <MemoryRouter>
        <StockoutStatistics statistics={statistics} />
      </MemoryRouter>,
    );

    expect(screen.getByText("fixed placements sold out")).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Sold-out fixed placements by day/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Wines affected by day/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Stores affected by day/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^New stockouts by day/ })).toBeTruthy();

    const wineLink = screen.getByRole("link", { name: /Estate Red/ });
    expect(wineLink.getAttribute("href")).toBe("/wines/100?from=2026-07-11&to=2026-07-12");
    expect(screen.getByText("4 sold-out store-days · 2 dates")).toBeTruthy();
    expect(screen.getAllByText("12 Jul 2026").length).toBeGreaterThan(0);

    const latestDay = screen.getByRole("row", { name: "12 Jul 2026 3 85% 2 2 2" });
    expect(within(latestDay).getByText("3")).toBeTruthy();
    expect(screen.getByText(/Optional local stock is excluded/)).toBeTruthy();
  });
});
