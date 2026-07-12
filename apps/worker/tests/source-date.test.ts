import { describe, expect, it } from "vitest";

import {
  monthFromSourceDate,
  sourceBoundsForMonth,
  sourceDateToIso,
} from "../src/ingestion/source-date";

describe("integer source dates", () => {
  it("converts valid dates and leap days", () => {
    expect(sourceDateToIso(20240229)).toBe("2024-02-29");
    expect(monthFromSourceDate(20260712)).toBe("2026-07");
  });

  it("rejects impossible or malformed dates", () => {
    expect(() => sourceDateToIso(20230229)).toThrow("Invalid inventory date");
    expect(() => sourceDateToIso(20241301)).toThrow("Invalid inventory date");
    expect(() => sourceDateToIso(20240101.5)).toThrow("not an integer");
  });

  it("returns inclusive source bounds for a month", () => {
    expect(sourceBoundsForMonth("2024-02")).toEqual({ from: 20240201, through: 20240229 });
    expect(() => sourceBoundsForMonth("2024-13")).toThrow("Invalid sync month");
  });
});
