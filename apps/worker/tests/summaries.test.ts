import { describe, expect, it } from "vitest";

import { summarizeAvailability } from "../src/api/summaries";

describe("catalog availability summaries", () => {
  it("counts tracked relations that sold out, had stock, and have current stock", () => {
    const result = summarizeAvailability(
      [
        { relatedId: 1, dates: ["2026-07-10", "2026-07-12"] },
        { relatedId: 1, dates: ["2026-07-11"] },
        { relatedId: 2, dates: ["2026-07-10"] },
        { relatedId: 3, dates: [] },
        { relatedId: 999, dates: ["2026-07-10", "2026-07-11", "2026-07-12"] },
      ],
      ["2026-07-10", "2026-07-11", "2026-07-12"],
      new Set([1, 2, 3]),
    );

    expect(result).toEqual({
      soldOutAtSomePoint: 2,
      inStockAtSomePoint: 2,
      currentlyInStock: 1,
    });
  });

  it("ignores observations outside source coverage", () => {
    expect(
      summarizeAvailability(
        [{ relatedId: 1, dates: ["2026-07-11", "2026-07-12"] }],
        ["2026-07-11"],
      ),
    ).toEqual({
      soldOutAtSomePoint: 0,
      inStockAtSomePoint: 1,
      currentlyInStock: 1,
    });
  });
});
