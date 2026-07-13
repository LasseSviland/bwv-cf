import { describe, expect, it } from "vitest";

import type { DailyInventory, MonopolySummary, WineSummary } from "@bwv/contracts";

import {
  assembleMonopolyInventory,
  assembleWineInventory,
  buildMonopolyWineSeries,
  buildWineMonopolySeries,
  completedWhileWineCurrent,
} from "../src/api/inventory";
import { MONOPOLIES_KEY, WINES_KEY, dailyInventoryKey } from "../src/storage/keys";
import { MemoryR2 } from "./r2-fixture";

const wines: WineSummary[] = [
  {
    id: 100,
    productNumber: "100",
    name: "Core Red",
    assortment: "Basisutvalget",
    assortmentGrades: ["SB1R"],
  },
  {
    id: 200,
    productNumber: "200",
    name: "Reserve Red",
    assortment: "Basisutvalget",
    assortmentGrades: ["SB2R"],
  },
  {
    id: 300,
    productNumber: "300",
    name: "Optional Rosé",
    assortment: "Bestillingsutvalget",
    assortmentGrades: [],
  },
  {
    id: 400,
    productNumber: "400",
    name: "Unstocked Optional White",
    assortment: "Bestillingsutvalget",
    assortmentGrades: [],
  },
];

const stores: MonopolySummary[] = [
  {
    id: 10,
    storeNumber: "10",
    name: "Store One Red",
    monopolyCategory: "1",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "1R",
  },
  {
    id: 20,
    storeNumber: "20",
    name: "Store Two Red",
    monopolyCategory: "2",
    monopolyProfile: "Rødt og Mørkt",
    storeAssortment: "2R",
  },
];

const dates = ["2026-07-12", "2026-07-13"];

describe("detail inventory series", () => {
  it("returns missing fixed-assortment wines as zero-count sold-out rows", () => {
    const observed = new Map<number, readonly DailyInventory[]>([
      [100, [{ date: "2026-07-13", count: 4 }]],
      [300, [{ date: "2026-07-13", count: 2 }]],
    ]);

    const result = buildMonopolyWineSeries(stores[1]!, wines, observed, dates);

    expect(result.map(({ wine }) => wine.id)).toEqual([100, 300, 200]);
    expect(result.find(({ wine }) => wine.id === 200)?.inventory).toEqual([
      { date: "2026-07-12", count: 0 },
      { date: "2026-07-13", count: 0 },
    ]);
    expect(result.some(({ wine }) => wine.id === 400)).toBe(false);
  });

  it("returns missing expected stores for a wine while preserving observed additional stores", () => {
    const observed = new Map<number, readonly DailyInventory[]>([
      [10, [{ date: "2026-07-13", count: 3 }]],
    ]);

    const result = buildWineMonopolySeries(wines[1]!, stores, observed, dates);

    expect(result.map(({ monopoly }) => monopoly.id)).toEqual([10, 20]);
    expect(result.find(({ monopoly }) => monopoly.id === 20)?.inventory).toEqual([
      { date: "2026-07-12", count: 0 },
      { date: "2026-07-13", count: 0 },
    ]);
  });

  it("keeps only observed stores and dates from before an outdated product was detected", () => {
    const outdatedWine: WineSummary = { ...wines[1]!, outdatedAt: "2026-07-13" };
    const observed = new Map<number, readonly DailyInventory[]>([
      [10, [{ date: "2026-07-12", count: 3 }]],
    ]);

    expect(buildWineMonopolySeries(outdatedWine, stores, observed, ["2026-07-12"])).toEqual([
      {
        monopoly: stores[0],
        inventory: [{ date: "2026-07-12", count: 3 }],
      },
    ]);
    expect(
      completedWhileWineCurrent(outdatedWine, [
        { date: "2026-07-12", etag: "before", uploaded: new Date("2026-07-12T08:00:00Z") },
        { date: "2026-07-13", etag: "after", uploaded: new Date("2026-07-13T08:00:00Z") },
      ]).map(({ date }) => date),
    ).toEqual(["2026-07-12"]);
  });

  it("serves outdated wine history directly but omits it from monopoly inventory", async () => {
    const r2 = new MemoryR2();
    r2.seed(WINES_KEY, {
      schemaVersion: 2,
      syncedAt: "2026-07-13T08:00:00.000Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: [
        {
          basic: { productId: "200", productLongName: "Historical wine" },
          logistics: { wholesalerName: "Better Wines AS" },
          assortment: { assortment: "Basisutvalget", assortmentGrades: [] },
        },
      ],
      outdatedProducts: { "200": "2026-07-13" },
    });
    r2.seed(MONOPOLIES_KEY, {
      schemaVersion: 1,
      syncedAt: "2026-07-13T08:00:00.000Z",
      source: "vinmonopolet/stores/v0/details",
      monopolies: [{ storeId: "10", storeName: "Store" }],
    });
    r2.seed(dailyInventoryKey("2026-07-12"), {
      schemaVersion: 1,
      syncedAt: "2026-07-12T08:00:00.000Z",
      date: "2026-07-12",
      source: "vinmonopolet/my-products/v1/stock-per-store",
      products: [{ productId: "200", stock: [{ storeId: "10", storeStock: 3 }] }],
    });
    r2.seed(dailyInventoryKey("2026-07-13"), {
      schemaVersion: 1,
      syncedAt: "2026-07-13T08:00:00.000Z",
      date: "2026-07-13",
      source: "vinmonopolet/my-products/v1/stock-per-store",
      products: [{ productId: "200", stock: [{ storeId: "10", storeStock: 2 }] }],
    });
    const env = { DATA_BUCKET: r2.bucket } as unknown as Env;
    const period = { from: "2026-07-12", to: "2026-07-13" } as const;

    const wineResult = await assembleWineInventory(env, 200, period);
    expect(wineResult.response).toMatchObject({
      wine: { productNumber: "200", outdatedAt: "2026-07-13" },
      availableDates: ["2026-07-12"],
      monopolies: [
        {
          monopoly: { storeNumber: "10" },
          inventory: [{ date: "2026-07-12", count: 3 }],
        },
      ],
    });

    const monopolyResult = await assembleMonopolyInventory(env, 10, period);
    expect(monopolyResult.response.wines).toEqual([]);
  });
});
