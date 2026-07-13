import { render, screen, within } from "@testing-library/react";
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
  it("explains pair counting and renders the complete daily breakdown", () => {
    render(<StockoutStatistics statistics={statistics} />);

    expect(screen.getByText("sold-out wine-store placements")).toBeTruthy();
    expect(screen.getByText(/One wine at five stores counts as five/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Daily sold-out wine-store placements/ })).toBeTruthy();

    const secondDay = screen.getByRole("row", {
      name: "12 Jul 2026 3 2 2 2 4 88",
    });
    expect(within(secondDay).getByText("3")).toBeTruthy();
    expect(screen.getByText(/not a confirmed sales measure/)).toBeTruthy();
  });
});
