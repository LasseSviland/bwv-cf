import { describe, expect, it } from "vitest";

import { cleanCategory } from "../src/ingestion/mysql";

describe("source catalog categories", () => {
  it("normalizes wine and monopoly display prefixes", () => {
    expect(cleanCategory("Butikkategori 6", "Butikkategori")).toBe("6");
    expect(cleanCategory(" Kategori 4 ", "Kategori")).toBe("4");
    expect(cleanCategory("Uavhengig sortiment", "Butikkategori")).toBe("Uavhengig sortiment");
  });

  it("keeps missing categories nullable", () => {
    expect(cleanCategory(null, "Kategori")).toBeNull();
    expect(cleanCategory("   ", "Kategori")).toBeNull();
  });
});
