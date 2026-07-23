import { describe, expect, it } from "vitest";

import {
  countCurrentStockByAssortment,
  countExpectedSoldOut,
  summarizeAvailability,
} from "../src/api/summaries";

describe("catalog availability summaries", () => {
  it("counts only expected relations missing on the latest day as currently sold out", () => {
    const entries = [
      { relatedId: 1, inventory: [{ date: "2026-07-13", count: 2 }] },
      { relatedId: 2, inventory: [{ date: "2026-07-12", count: 3 }] },
      { relatedId: 3, inventory: [{ date: "2026-07-12", count: 4 }] },
    ];

    expect(countExpectedSoldOut(entries, "2026-07-13", new Set([1, 2]))).toBe(1);
  });

  it("separates current fixed-assortment and additional stock", () => {
    const entries = [
      { relatedId: 1, inventory: [{ date: "2026-07-13", count: 2 }] },
      { relatedId: 2, inventory: [{ date: "2026-07-12", count: 3 }] },
      { relatedId: 3, inventory: [{ date: "2026-07-13", count: 4 }] },
    ];

    expect(countCurrentStockByAssortment(entries, "2026-07-13", new Set([1, 2]))).toEqual({
      currentlyFixedInStock: 1,
      currentlyAdditionalInStock: 1,
    });
  });

  it("keeps fixed stocked plus sold out equal to the expected assortment size", () => {
    const entries = [
      { relatedId: 1, inventory: [{ date: "2026-07-13", count: 2 }] },
      { relatedId: 3, inventory: [{ date: "2026-07-13", count: 4 }] },
    ];
    const expectedWineIds = new Set([1, 2]);

    const { currentlyFixedInStock } = countCurrentStockByAssortment(
      entries,
      "2026-07-13",
      expectedWineIds,
    );
    const currentlySoldOut = countExpectedSoldOut(entries, "2026-07-13", expectedWineIds);

    expect(currentlyFixedInStock + currentlySoldOut).toBe(expectedWineIds.size);
  });

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
      currentlySoldOut: 2,
      inStockByDate: [
        { date: "2026-07-10", count: 2 },
        { date: "2026-07-11", count: 1 },
        { date: "2026-07-12", count: 1 },
      ],
    });
  });

  it("ignores observations outside source coverage and zero stock", () => {
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
          { relatedId: 2, inventory: [{ date: "2026-07-11", count: 0 }] },
        ],
        ["2026-07-11"],
      ),
    ).toEqual({
      soldOutAtSomePoint: 1,
      inStockAtSomePoint: 1,
      currentlyInStock: 1,
      inStockByDate: [{ date: "2026-07-11", count: 1 }],
    });
  });
});
