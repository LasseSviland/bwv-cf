import { describe, expect, it } from "vitest";

import type { MonopolySummary, WineSummary } from "@bwv/contracts";
import { decodeCatalogCursor } from "@bwv/data-format";

import {
  parseCatalogLimit,
  parseEntityId,
  searchMonopolyCatalog,
  searchWineCatalog,
} from "../src/api/catalog";
import {
  activeWineSources,
  betterWinesOnly,
  getSearchableWineCatalog,
  getWineCatalog,
  getWineDetail,
  mergeWines,
  monopolyDetailFromSource,
  updatedOutdatedProducts,
  wineDetailFromSource,
} from "../src/ingestion/catalogs";
import type { JsonObject, WineCatalogFile } from "../src/types";
import { WINES_KEY } from "../src/storage/keys";
import { MemoryR2 } from "./r2-fixture";

const wines: WineSummary[] = [
  {
    id: 1,
    productNumber: "100",
    name: "Bordeaux Rouge",
    producer: "Château Dëmo",
    country: "Frankrike",
    wineCategory: "6",
  },
  {
    id: 2,
    productNumber: "200",
    name: "Rioja Reserva",
    producer: "Bodëgas Røda",
    country: "Spania",
    wineCategory: "5",
  },
  {
    id: 3,
    productNumber: "300",
    name: "Mosel Riesling",
    country: "Tyskland",
    wineCategory: null,
  },
];

const monopolies: MonopolySummary[] = [
  {
    id: 1,
    storeNumber: "001",
    name: "Oslo Sentrum",
    postalCode: "0101",
    city: "Oslo",
    monopolyCategory: "6",
  },
  {
    id: 2,
    storeNumber: "002",
    name: "Bergen Storsenter",
    postalCode: "5015",
    city: "Bergen",
    monopolyCategory: "4",
  },
];

describe("catalog query helpers", () => {
  it("searches wines by name, product number, country, or wine category", () => {
    expect(searchWineCatalog(wines, "rioja", undefined, 10).items.map(({ id }) => id)).toEqual([2]);
    expect(searchWineCatalog(wines, "300", undefined, 10).items.map(({ id }) => id)).toEqual([3]);
    expect(searchWineCatalog(wines, "frankrike", undefined, 10).items.map(({ id }) => id)).toEqual([
      1,
    ]);
    expect(searchWineCatalog(wines, "6", undefined, 10).items.map(({ id }) => id)).toEqual([1]);
  });

  it("normalizes wine names, producers, and queries before searching", () => {
    expect(
      searchWineCatalog(wines, "bodegas roda", undefined, 10).items.map(({ id }) => id),
    ).toEqual([2]);
    expect(
      searchWineCatalog(wines, "BODËGAS RØDA", undefined, 10).items.map(({ id }) => id),
    ).toEqual([2]);
    expect(
      searchWineCatalog(wines, "chateau demo", undefined, 10).items.map(({ id }) => id),
    ).toEqual([1]);
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

  it("searches stores by number, location, postal code, and monopoly category", () => {
    expect(searchMonopolyCatalog(monopolies, "bergen", undefined, 10).items[0]?.id).toBe(2);
    expect(searchMonopolyCatalog(monopolies, "0101", undefined, 10).items[0]?.id).toBe(1);
    expect(searchMonopolyCatalog(monopolies, "002", undefined, 10).items[0]?.id).toBe(2);
    expect(searchMonopolyCatalog(monopolies, "4", undefined, 10).items[0]?.id).toBe(2);
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

describe("entity details", () => {
  it("excludes products owned by another importer or distributor", () => {
    const catalog: JsonObject[] = [
      {
        basic: { productId: "100", productLongName: "Better Wines bottle" },
        logistics: { wholesalerName: "Better Wines AS" },
      },
      {
        basic: { productId: "200", productLongName: "Other importer bottle" },
        logistics: { wholesalerName: "Another Importer AS" },
      },
      {
        basic: { productId: "300", productLongName: "Unknown distributor bottle" },
      },
    ];

    expect(betterWinesOnly(catalog).map((wine) => wine.basic)).toEqual([
      { productId: "100", productLongName: "Better Wines bottle" },
    ]);
  });

  it("keeps outdated products in the file while excluding them from the active catalog", () => {
    const previous = [
      {
        basic: { productId: "100", productLongName: "Current wine" },
        logistics: { wholesalerName: "Better Wines AS" },
      },
      {
        basic: { productId: "999", productLongName: "Old wine" },
        logistics: { wholesalerName: "Better Wines AS" },
      },
    ] satisfies JsonObject[];
    const current = [
      {
        basic: { productId: "100", productLongName: "Current wine" },
        logistics: { wholesalerName: "Better Wines AS" },
      },
    ] satisfies JsonObject[];
    const merged = mergeWines(previous, current);
    const outdatedProducts = updatedOutdatedProducts({}, merged, current, "2026-07-13");
    const file: WineCatalogFile = {
      schemaVersion: 2,
      syncedAt: "2026-07-13T08:00:00Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: merged,
      outdatedProducts,
    };

    expect(file.wines).toHaveLength(2);
    expect(file.outdatedProducts).toEqual({ "999": "2026-07-13" });
    expect(activeWineSources(file).map((wine) => wine.basic)).toEqual([
      { productId: "100", productLongName: "Current wine" },
    ]);
  });

  it("preserves the first detection date and clears it when a product returns", () => {
    const current = [
      {
        basic: { productId: "999", productLongName: "Returning wine" },
        logistics: { wholesalerName: "Better Wines AS" },
      },
    ] satisfies JsonObject[];
    expect(
      updatedOutdatedProducts(
        { "100": "2026-07-01", "999": "2026-07-02" },
        [
          {
            basic: { productId: "100", productLongName: "Still absent" },
            logistics: { wholesalerName: "Better Wines AS" },
          },
          ...current,
        ],
        current,
        "2026-07-13",
      ),
    ).toEqual({ "100": "2026-07-01" });
  });

  it("returns outdated products only from searchable and direct-detail catalog reads", async () => {
    const r2 = new MemoryR2();
    r2.seed(WINES_KEY, {
      schemaVersion: 2,
      syncedAt: "2026-07-13T08:00:00Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: [
        {
          basic: { productId: "100", productLongName: "Current wine" },
          logistics: { wholesalerName: "Better Wines AS" },
        },
        {
          basic: { productId: "999", productLongName: "Historical wine" },
          logistics: { wholesalerName: "Better Wines AS" },
        },
      ],
      outdatedProducts: { "999": "2026-07-13" },
    });
    const env = { DATA_BUCKET: r2.bucket } as unknown as Env;

    await expect(getWineCatalog(env)).resolves.toMatchObject([
      { productNumber: "100", outdatedAt: null },
    ]);
    await expect(getSearchableWineCatalog(env)).resolves.toMatchObject([
      { productNumber: "100", outdatedAt: null },
      { productNumber: "999", outdatedAt: "2026-07-13" },
    ]);
    await expect(getWineDetail(env, 999)).resolves.toMatchObject({
      productNumber: "999",
      outdatedAt: "2026-07-13",
    });
  });

  it("preserves the complete wine source record in the API detail shape", () => {
    const source: JsonObject = {
      basic: {
        productId: "20491401",
        productLongName: "Pora Riserva",
        volume: 0.75,
        alcoholContent: 14.5,
      },
      logistics: { wholesalerName: "Better Wines AS", manufacturerName: "Produttori" },
      origins: { origin: { country: "Italia", region: "Piemonte" } },
      classification: { productTypeName: "Rødvin" },
      assortment: {
        assortment: "Basisutvalget",
        assortmentGrades: [{ assortmentGrade: "SB4L" }, { assortmentGrade: "SB5R" }],
      },
      ingredients: { grapes: [{ grapeDesc: "Nebbiolo", grapePct: 100 }] },
      properties: { organic: false },
      legacyDatabase: { pris: "759.90", metode: "Tradisjonell vinifikasjon" },
    };

    const detail = wineDetailFromSource(source);

    expect(detail).toMatchObject({
      id: 20_491_401,
      productNumber: "20491401",
      name: "Pora Riserva",
      producer: "Produttori",
      country: "Italia",
      wineCategory: "SB4L, SB5R",
      assortment: "Basisutvalget",
      assortmentGrades: ["SB4L", "SB5R"],
    });
    expect(detail.sourceData).toEqual(source);
  });

  it("preserves the complete monopoly source record in the API detail shape", () => {
    const source: JsonObject = {
      storeId: "114",
      storeName: "Oslo, Aker Brygge",
      category: "6",
      profile: "Rødt og Mørkt",
      storeAssortment: "6R",
      address: { street: "Bryggegata 9", postalCode: "0250", city: "Oslo" },
      telephone: "22 01 50 00",
      openingHours: [{ dayOfTheWeek: "Monday", openingTime: "10:00" }],
      legacyDatabase: { total_vin_num: 17 },
    };

    const detail = monopolyDetailFromSource(source);

    expect(detail).toMatchObject({
      id: 114,
      storeNumber: "114",
      name: "Oslo, Aker Brygge",
      city: "Oslo",
      monopolyCategory: "6",
      monopolyProfile: "Rødt og Mørkt",
      storeAssortment: "6R",
    });
    expect(detail.sourceData).toEqual(source);
  });

  it("reads a legacy assortment category while migrated catalogs are being refreshed", () => {
    const detail = wineDetailFromSource({
      basic: { productId: "1946001", productLongName: "Chablis Premier Cru" },
      legacyDatabase: { produktutvalg: "Basisutvalget", butikkategori: "SB6L" },
      classification: { productTypeName: "Rødvin" },
    });

    expect(detail).toMatchObject({
      wineCategory: "SB6L",
      assortment: "Basisutvalget",
      assortmentGrades: ["SB6L"],
    });
  });
});
