import { describe, expect, expectTypeOf, it } from "vitest";

import type { DailyInventory, Month, Period } from "@bwv/contracts";

import {
  CalendarFormatError,
  CursorError,
  QueryPeriodError,
  addDays,
  addMonths,
  compareDateStrings,
  compareMonths,
  currentAndPreviousMonthsInOslo,
  currentMonthInOslo,
  dateInOslo,
  daysInCalendarMonth,
  decodeCatalogCursor,
  defaultPeriodInOslo,
  encodeCatalogCursor,
  enumerateDates,
  enumerateMonths,
  firstDateOfMonth,
  formatDateString,
  formatMonth,
  inclusiveDayCount,
  isDateString,
  isLeapYear,
  isMonthString,
  lastDateOfMonth,
  mergeAndZeroFillInventorySeries,
  mergeSparseInventorySeries,
  monthForDate,
  monthsForPeriod,
  nextCatalogCursor,
  parseDateString,
  parseMonth,
  previousMonthInOslo,
  resolveCatalogCursor,
  safeValidateQueryPeriod,
  validateQueryPeriod,
  zeroFillInventorySeries,
} from "../src/index.js";

describe("date parsing and arithmetic", () => {
  it("parses, formats, and narrows valid dates", () => {
    expect(parseDateString("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(formatDateString({ year: 7, month: 1, day: 2 })).toBe("0007-01-02");
    expect(isDateString("2026-07-12")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(() => parseDateString("2026-02-29")).toThrow(CalendarFormatError);
    expect(() => formatDateString({ year: 2026, month: 2, day: 29 })).toThrow(CalendarFormatError);
  });

  it("implements Gregorian leap-year rules", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInCalendarMonth(2024, 2)).toBe(29);
    expect(daysInCalendarMonth(2026, 2)).toBe(28);
    expect(() => daysInCalendarMonth(2026, 13)).toThrow(CalendarFormatError);
  });

  it("adds days across month, year, and leap-day boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-07-12", 0)).toBe("2026-07-12");
    expect(() => addDays("2026-07-12", 0.5)).toThrow(CalendarFormatError);
  });

  it("compares and enumerates an inclusive date range", () => {
    expect(compareDateStrings("2026-07-01", "2026-07-02")).toBe(-1);
    expect(compareDateStrings("2026-07-02", "2026-07-02")).toBe(0);
    expect(compareDateStrings("2026-07-03", "2026-07-02")).toBe(1);
    expect(inclusiveDayCount("2026-06-29", "2026-07-02")).toBe(4);
    expect(enumerateDates("2026-06-29", "2026-07-02")).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
    ]);
    expect(() => enumerateDates("2026-07-02", "2026-07-01")).toThrow(CalendarFormatError);
    expect(() => enumerateDates("2026-07-01", "2026-07-03", 2)).toThrow(/contains 3 days/);
  });
});

describe("month parsing and arithmetic", () => {
  it("parses, formats, and narrows months", () => {
    expect(parseMonth("2026-07")).toEqual({ year: 2026, month: 7 });
    expect(formatMonth({ year: 7, month: 2 })).toBe("0007-02");
    expect(isMonthString("2026-12")).toBe(true);
    expect(isMonthString("2026-13")).toBe(false);
    expect(() => parseMonth("2026-13")).toThrow(CalendarFormatError);
  });

  it("adds, compares, and enumerates across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 2)).toBe("2026-02");
    expect(compareMonths("2025-12", "2026-01")).toBe(-1);
    expect(compareMonths("2026-01", "2026-01")).toBe(0);
    expect(enumerateMonths("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(() => enumerateMonths("2026-02", "2026-01")).toThrow(CalendarFormatError);
    expect(() => enumerateMonths("2025-11", "2026-02", 3)).toThrow(/contains 4 months/);
  });

  it("derives month date bounds and intersecting period months", () => {
    expect(monthForDate("2026-07-12")).toBe("2026-07");
    expect(firstDateOfMonth("2024-02")).toBe("2024-02-01");
    expect(lastDateOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDateOfMonth("2026-02")).toBe("2026-02-28");
    expect(monthsForPeriod({ from: "2025-12-31", to: "2026-02-01" })).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("Europe/Oslo calendar helpers", () => {
  it("uses the Oslo date when UTC is still on the previous date", () => {
    const instant = new Date("2026-07-11T22:30:00.000Z");
    expect(dateInOslo(instant)).toBe("2026-07-12");
    expect(currentMonthInOslo(instant)).toBe("2026-07");
    expect(previousMonthInOslo(instant)).toBe("2026-06");
    expect(currentAndPreviousMonthsInOslo(instant)).toEqual(["2026-06", "2026-07"]);
  });

  it("handles the Oslo new-year boundary", () => {
    const instant = new Date("2025-12-31T23:30:00.000Z");
    expect(dateInOslo(instant)).toBe("2026-01-01");
    expect(currentAndPreviousMonthsInOslo(instant)).toEqual(["2025-12", "2026-01"]);
  });

  it("produces the product default period", () => {
    expect(defaultPeriodInOslo(new Date("2026-07-12T10:00:00.000Z"))).toEqual({
      from: "2026-06-13",
      to: "2026-07-12",
    });
    expect(() => dateInOslo(new Date("invalid"))).toThrow(CalendarFormatError);
  });
});

describe("query period validation", () => {
  const now = new Date("2026-07-12T10:00:00.000Z");

  it("applies Oslo defaults and independently accepts explicit bounds", () => {
    expect(validateQueryPeriod({}, { now })).toEqual({
      from: "2026-06-13",
      to: "2026-07-12",
    });
    expect(validateQueryPeriod({ from: "2026-07-01" }, { now })).toEqual({
      from: "2026-07-01",
      to: "2026-07-12",
    });
    expect(validateQueryPeriod({ from: "2026-01-01", to: "2026-01-31" }, { now })).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it.each([
    [{ from: "2026-02-30", to: "2026-07-12" }, "invalid_from"],
    [{ from: "2026-07-01", to: "2026-7-12" }, "invalid_to"],
    [{ from: "2026-07-12", to: "2026-07-01" }, "from_after_to"],
    [{ from: "2026-07-01", to: "2026-07-13" }, "future_date"],
  ] as const)("rejects %o with %s", (input, code) => {
    try {
      validateQueryPeriod(input, { now });
      throw new Error("Expected period validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(QueryPeriodError);
      expect((error as QueryPeriodError).code).toBe(code);
    }
  });

  it("enforces an inclusive maximum range", () => {
    expect(
      validateQueryPeriod({ from: "2026-07-10", to: "2026-07-12" }, { now, maxDays: 3 }),
    ).toEqual({ from: "2026-07-10", to: "2026-07-12" });
    expect(() =>
      validateQueryPeriod({ from: "2026-07-09", to: "2026-07-12" }, { now, maxDays: 3 }),
    ).toThrow(/maximum is 3/);
    expect(() => validateQueryPeriod({}, { now, maxDays: 0 })).toThrow(RangeError);
  });

  it("offers a discriminated non-throwing result", () => {
    const result = safeValidateQueryPeriod({ from: "bad" }, { now });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("invalid_from");

    const valid = safeValidateQueryPeriod({ from: "2026-07-12" }, { now });
    expect(valid).toEqual({
      success: true,
      period: { from: "2026-07-12", to: "2026-07-12" },
    });
  });
});

describe("sparse inventory series", () => {
  const june: DailyInventory[] = [
    { date: "2026-06-03", count: 4 },
    { date: "2026-06-01", count: 2 },
  ];
  const july: DailyInventory[] = [
    { date: "2026-07-01", count: 1 },
    { date: "2026-06-03", count: 5 },
  ];

  it("merges partitions in date order with last-partition conflict precedence", () => {
    expect(mergeSparseInventorySeries([june, july])).toEqual([
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-03", count: 5 },
      { date: "2026-07-01", count: 1 },
    ]);
  });

  it("supports first-value and fail-fast conflict policies", () => {
    expect(mergeSparseInventorySeries([june, july], { onConflict: "first" })[1]).toEqual({
      date: "2026-06-03",
      count: 4,
    });
    expect(() => mergeSparseInventorySeries([june, july], { onConflict: "error" })).toThrow(
      /Conflicting inventory counts/,
    );
    expect(() => mergeSparseInventorySeries([[{ date: "2026-07-01", count: -1 }]])).toThrow();
    expect(() =>
      mergeSparseInventorySeries([june, july], {
        onConflict: "unsupported" as "last",
      }),
    ).toThrow(/Unsupported inventory conflict strategy/);
  });

  it("does not treat an identical duplicate as a conflict", () => {
    const duplicate = [{ date: "2026-06-01", count: 2 }];
    expect(mergeSparseInventorySeries([duplicate, duplicate], { onConflict: "error" })).toEqual(
      duplicate,
    );
  });

  it("clips outside facts and zero-fills every requested day", () => {
    expect(
      zeroFillInventorySeries(
        [
          { date: "2026-06-30", count: 9 },
          { date: "2026-07-01", count: 2 },
          { date: "2026-07-03", count: 1 },
          { date: "2026-07-04", count: 7 },
        ],
        { from: "2026-07-01", to: "2026-07-03" },
      ),
    ).toEqual([
      { date: "2026-07-01", count: 2 },
      { date: "2026-07-02", count: 0 },
      { date: "2026-07-03", count: 1 },
    ]);
  });

  it("merges and fills in one operation", () => {
    const period: Period = { from: "2026-06-01", to: "2026-06-04" };
    const result = mergeAndZeroFillInventorySeries([june, july], period);
    expect(result).toEqual([
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-02", count: 0 },
      { date: "2026-06-03", count: 5 },
      { date: "2026-06-04", count: 0 },
    ]);
    expectTypeOf(result).toEqualTypeOf<DailyInventory[]>();
  });
});

describe("opaque catalog cursors", () => {
  it("round-trips offsets and Unicode search terms without exposing JSON", () => {
    const cursor = encodeCatalogCursor({ offset: 125, query: "rødvin å" });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain("rødvin");
    expect(decodeCatalogCursor(cursor)).toEqual({ offset: 125, query: "rødvin å" });
  });

  it("supports cursors without a query", () => {
    const cursor = encodeCatalogCursor({ offset: 0 });
    expect(decodeCatalogCursor(cursor)).toEqual({ offset: 0 });
  });

  it.each(["", "not valid!", "a", "WzIsMF0"])("rejects malformed cursor %s", (cursor) => {
    expect(() => decodeCatalogCursor(cursor)).toThrow(CursorError);
  });

  it("rejects invalid cursor inputs before encoding", () => {
    expect(() => encodeCatalogCursor({ offset: -1 })).toThrow(CursorError);
    expect(() => encodeCatalogCursor({ offset: 1.5 })).toThrow(CursorError);
    expect(() => encodeCatalogCursor({ offset: 0, query: "x".repeat(501) })).toThrow(CursorError);
  });

  it("binds a cursor to the search query", () => {
    expect(resolveCatalogCursor(null, "riesling")).toEqual({ offset: 0, query: "riesling" });
    const cursor = encodeCatalogCursor({ offset: 20, query: "riesling" });
    expect(resolveCatalogCursor(cursor, "riesling")).toEqual({
      offset: 20,
      query: "riesling",
    });
    expect(() => resolveCatalogCursor(cursor, "merlot")).toThrow(/does not belong/);
  });

  it("creates a next cursor only when another page exists", () => {
    expect(nextCatalogCursor(20, 10, false, "wine")).toBeNull();
    const next = nextCatalogCursor(20, 10, true, "wine");
    expect(next).not.toBeNull();
    expect(decodeCatalogCursor(next as string)).toEqual({ offset: 30, query: "wine" });
    expect(() => nextCatalogCursor(0, -1, true)).toThrow(CursorError);
  });

  it("retains the Month type in enumerated results", () => {
    const months = enumerateMonths("2026-06", "2026-07");
    expectTypeOf(months).toEqualTypeOf<Month[]>();
  });
});
