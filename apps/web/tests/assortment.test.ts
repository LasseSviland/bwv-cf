import { describe, expect, it } from "vitest";
import type { MonopolySummary, WineSummary } from "../src/api/types";
import { classifyWineForStore } from "../src/utils/assortment";

const wine = (overrides: Partial<WineSummary> = {}): WineSummary => ({
  id: 1,
  productNumber: "1",
  name: "Test wine",
  ...overrides,
});

const store = (overrides: Partial<MonopolySummary> = {}): MonopolySummary => ({
  id: 1,
  storeNumber: "1",
  name: "Test store",
  ...overrides,
});

describe("classifyWineForStore", () => {
  it("requires only the same or lower category in a store", () => {
    const categoryThree = store({ monopolyCategory: "3" });

    expect(classifyWineForStore(wine({ assortmentGrades: ["SB3R"] }), categoryThree).status).toBe(
      "required",
    );
    expect(classifyWineForStore(wine({ assortmentGrades: ["SB2R"] }), categoryThree).status).toBe(
      "required",
    );
    expect(classifyWineForStore(wine({ assortmentGrades: ["SB4R"] }), categoryThree).status).toBe(
      "additional",
    );
  });

  it("uses the store demand profile when Vinmonopolet provides profile-specific grades", () => {
    const profileGrades = wine({ assortmentGrades: ["SB2R", "SB5L"] });

    expect(
      classifyWineForStore(profileGrades, store({ monopolyCategory: "3", storeAssortment: "3R" }))
        .status,
    ).toBe("required");
    expect(
      classifyWineForStore(profileGrades, store({ monopolyCategory: "3", storeAssortment: "3L" }))
        .status,
    ).toBe("additional");
  });

  it("treats order-range wine as an additional product", () => {
    expect(
      classifyWineForStore(
        wine({ assortment: "Bestillingsutvalget", assortmentGrades: [] }),
        store({ monopolyCategory: "6", storeAssortment: "6R" }),
      ).status,
    ).toBe("additional");
  });

  it("does not infer sold-out status when category data is unavailable", () => {
    expect(classifyWineForStore(wine(), store()).status).toBe("unknown");
  });
});
