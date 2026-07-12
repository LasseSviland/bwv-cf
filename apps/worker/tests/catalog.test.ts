import { describe, expect, it } from "vitest";

import type { MonopolySummary, WineSummary } from "@bwv/contracts";
import { decodeCatalogCursor } from "@bwv/data-format";

import {
  parseCatalogLimit,
  parseEntityId,
  searchMonopolyCatalog,
  searchWineCatalog,
} from "../src/api/catalog";

const wines: WineSummary[] = [
  { id: 1, productNumber: "100", name: "Bordeaux Rouge", country: "Frankrike" },
  { id: 2, productNumber: "200", name: "Rioja Reserva", country: "Spania" },
  { id: 3, productNumber: "300", name: "Mosel Riesling", country: "Tyskland" },
];

const monopolies: MonopolySummary[] = [
  { id: 1, storeNumber: "001", name: "Oslo Sentrum", postalCode: "0101", city: "Oslo" },
  { id: 2, storeNumber: "002", name: "Bergen Storsenter", postalCode: "5015", city: "Bergen" },
];

describe("catalog query helpers", () => {
  it("searches wines by name, product number, or country", () => {
    expect(searchWineCatalog(wines, "rioja", undefined, 10).items.map(({ id }) => id)).toEqual([2]);
    expect(searchWineCatalog(wines, "300", undefined, 10).items.map(({ id }) => id)).toEqual([3]);
    expect(searchWineCatalog(wines, "frankrike", undefined, 10).items.map(({ id }) => id)).toEqual([
      1,
    ]);
  });

  it("paginates with a cursor bound to the normalized query", () => {
    const first = searchWineCatalog(wines, "", undefined, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor;
    if (cursor === null) throw new Error("Expected a cursor");
    expect(decodeCatalogCursor(cursor)).toEqual({ offset: 2, query: "" });
    expect(searchWineCatalog(wines, "", cursor, 2).items.map(({ id }) => id)).toEqual([3]);
    expect(() => searchWineCatalog(wines, "rioja", cursor, 2)).toThrow("Cursor");
  });

  it("searches stores by number, location, and postal code", () => {
    expect(searchMonopolyCatalog(monopolies, "bergen", undefined, 10).items[0]?.id).toBe(2);
    expect(searchMonopolyCatalog(monopolies, "0101", undefined, 10).items[0]?.id).toBe(1);
    expect(searchMonopolyCatalog(monopolies, "002", undefined, 10).items[0]?.id).toBe(2);
  });

  it("validates entity ids and limits", () => {
    expect(parseEntityId("42")).toBe(42);
    expect(() => parseEntityId("0")).toThrow("Invalid entity id");
    expect(() => parseEntityId("1.5")).toThrow("Invalid entity id");
    expect(parseCatalogLimit(undefined)).toBe(50);
    expect(parseCatalogLimit("100")).toBe(100);
    expect(parseCatalogLimit("1000")).toBe(1000);
    expect(() => parseCatalogLimit("1001")).toThrow("between 1 and 1000");
  });
});
