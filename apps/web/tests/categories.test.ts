import { describe, expect, it } from "vitest";
import { numericCategories } from "../src/utils/categories";

describe("numericCategories", () => {
  it("collapses left and right assortment variants into one numeric category", () => {
    expect(numericCategories("SB4L", "SB4R", "4")).toEqual(["4"]);
  });

  it("extracts, deduplicates and numerically sorts categories from combined fields", () => {
    expect(numericCategories("SB5R, SB4L", "Category 6R", "SB4R")).toEqual(["4", "5", "6"]);
  });

  it("ignores unrelated and multi-digit numbers", () => {
    expect(numericCategories("Product 14R", "No category", "SB7L")).toEqual([]);
  });
});
