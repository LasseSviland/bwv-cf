import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  AdminAcceptedResponseSchema,
  ApiErrorResponseSchema,
  CatalogResponseSchema,
  DailyInventorySchema,
  DateStringSchema,
  FreshnessSchema,
  MonopolyDetailSchema,
  MonopolyCatalogResponseSchema,
  MonopolyInventoryResponseSchema,
  MonopolySummarySchema,
  MonthSchema,
  PeriodSchema,
  StatusResponseSchema,
  StatisticsResponseSchema,
  SyncQueueMessageSchema,
  UtcDateTimeSchema,
  WineCatalogResponseSchema,
  WineDetailSchema,
  WineInventoryResponseSchema,
  WineSummarySchema,
  type AdminAcceptedResponse,
  type CatalogResponse,
  type MonopolyInventoryResponse,
  type MonopolyDetail,
  type StatusResponse,
  type StatisticsResponse,
  type SyncQueueMessage,
  type WineInventoryResponse,
  type WineDetail,
  type WineSummary,
} from "../src/index.js";

const wine = {
  id: 17,
  productNumber: "001234",
  name: "Fjordglimt Riesling",
  country: "Tyskland",
  wineCategory: "6",
  assortment: "Basisutvalget",
  assortmentGrades: ["SB6L", "SB6R"],
};

const monopoly = {
  id: 31,
  storeNumber: "104",
  name: "Oslo, Aker Brygge",
  postalCode: "0250",
  city: "Oslo",
  monopolyCategory: "5",
  monopolyProfile: "Rødt og Mørkt",
  storeAssortment: "5R",
};

const freshness = {
  datasetGeneratedAt: "2026-07-12T08:30:00.000Z",
  sourceWatermark: 8_089_764,
  coveredThrough: "2026-07-12",
  availableDates: ["2026-07-11", "2026-07-12"],
  missingMonths: ["2024-03"],
};

describe("calendar primitives", () => {
  it.each(["0000-01-01", "2024-02-29", "2026-07-12", "9999-12-31"])(
    "accepts the valid date %s",
    (value) => {
      expect(DateStringSchema.parse(value)).toBe(value);
    },
  );

  it.each(["", "2026-7-01", "2026-00-01", "2026-02-29", "1900-02-29", "2026-04-31"])(
    "rejects the invalid date %s",
    (value) => {
      expect(DateStringSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["0000-01", "2024-02", "9999-12"])("accepts the valid month %s", (value) => {
    expect(MonthSchema.parse(value)).toBe(value);
  });

  it.each(["2024-00", "2024-13", "24-01", "2024-1"])("rejects the invalid month %s", (value) => {
    expect(MonthSchema.safeParse(value).success).toBe(false);
  });

  it("requires an ordered, strict period", () => {
    expect(PeriodSchema.parse({ from: "2026-07-01", to: "2026-07-12" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-12",
    });
    expect(PeriodSchema.safeParse({ from: "2026-07-13", to: "2026-07-12" }).success).toBe(false);
    expect(
      PeriodSchema.safeParse({ from: "2026-07-01", to: "2026-07-12", timezone: "UTC" }).success,
    ).toBe(false);
  });

  it("accepts only UTC metadata timestamps", () => {
    expect(UtcDateTimeSchema.safeParse("2026-07-12T08:30:00Z").success).toBe(true);
    expect(UtcDateTimeSchema.safeParse("2026-07-12T10:30:00+02:00").success).toBe(false);
    expect(UtcDateTimeSchema.safeParse("2026-07-12").success).toBe(false);
  });
});

describe("entity and inventory schemas", () => {
  it("validates and trims wine summaries while preserving product numbers", () => {
    expect(WineSummarySchema.parse({ id: 17, productNumber: " 001234 ", name: " Wine " })).toEqual({
      id: 17,
      productNumber: "001234",
      name: "Wine",
    });
    expectTypeOf<WineSummary>().toMatchTypeOf<{
      id: number;
      productNumber: string;
      name: string;
    }>();
    expectTypeOf<WineSummary["wineCategory"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<WineSummary["assortmentGrades"]>().toEqualTypeOf<string[] | undefined>();
  });

  it("rejects invalid identifiers, blank fields, and extra fields while accepting source nulls", () => {
    expect(WineSummarySchema.safeParse({ ...wine, id: 0 }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, name: " " }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, country: null }).success).toBe(true);
    expect(WineSummarySchema.safeParse({ ...wine, wineCategory: " " }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, assortmentGrades: [" "] }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, secret: "no" }).success).toBe(false);
    expect(MonopolySummarySchema.safeParse({ ...monopoly, postalCode: "" }).success).toBe(false);
    expect(
      MonopolySummarySchema.safeParse({ ...monopoly, postalCode: null, city: null }).success,
    ).toBe(true);
    expect(MonopolySummarySchema.safeParse({ ...monopoly, monopolyCategory: null }).success).toBe(
      true,
    );
  });

  it("exposes complete JSON source data through strict entity detail contracts", () => {
    const wineDetail = WineDetailSchema.parse({
      ...wine,
      sourceData: {
        basic: { productId: "001234", volume: 0.75, vintage: 2022 },
        properties: { organic: true },
        grapes: [{ name: "Riesling", percentage: 100 }],
        legacyDatabase: { method: null },
      },
    });
    const monopolyDetail = MonopolyDetailSchema.parse({
      ...monopoly,
      sourceData: {
        address: { street: "Bryggegata 9", postalCode: "0250" },
        openingHours: [{ day: "Monday", opens: "10:00", closes: "18:00" }],
      },
    });

    expect(wineDetail.sourceData.properties).toEqual({ organic: true });
    expect(monopolyDetail.sourceData.address).toEqual({
      street: "Bryggegata 9",
      postalCode: "0250",
    });
    expectTypeOf(wineDetail).toMatchTypeOf<WineDetail>();
    expectTypeOf(monopolyDetail).toMatchTypeOf<MonopolyDetail>();
    expect(WineDetailSchema.safeParse({ ...wine, sourceData: null }).success).toBe(false);
    expect(MonopolyDetailSchema.safeParse({ ...monopoly, sourceData: [] }).success).toBe(false);
  });

  it("validates non-negative integer daily inventory", () => {
    expect(DailyInventorySchema.parse({ date: "2026-07-12", count: 0 })).toEqual({
      date: "2026-07-12",
      count: 0,
    });
    expect(DailyInventorySchema.safeParse({ date: "2026-07-12", count: -1 }).success).toBe(false);
    expect(DailyInventorySchema.safeParse({ date: "2026-07-12", count: 1.5 }).success).toBe(false);
  });

  it("validates freshness and rejects duplicate or malformed missing months", () => {
    expect(FreshnessSchema.parse(freshness)).toEqual(freshness);
    expect(
      FreshnessSchema.safeParse({ ...freshness, missingMonths: ["2024-03", "2024-03"] }).success,
    ).toBe(false);
    expect(
      FreshnessSchema.safeParse({ ...freshness, datasetGeneratedAt: "2026-07-12 08:30:00" })
        .success,
    ).toBe(false);
    expect(
      FreshnessSchema.safeParse({
        ...freshness,
        availableDates: ["2026-07-12", "2026-07-12"],
      }).success,
    ).toBe(false);
  });

  it("validates the canonical wine inventory response", () => {
    const response = {
      ...freshness,
      wine,
      period: { from: "2026-07-10", to: "2026-07-12" },
      monopolies: [
        {
          monopoly,
          inventory: [
            { date: "2026-07-10", count: 2 },
            { date: "2026-07-11", count: 0 },
            { date: "2026-07-12", count: 1 },
          ],
        },
      ],
    };

    expect(WineInventoryResponseSchema.parse(response)).toEqual(response);
    expectTypeOf(response).toMatchTypeOf<WineInventoryResponse>();
    expect(WineInventoryResponseSchema.safeParse({ ...response, from: "2026-07-10" }).success).toBe(
      false,
    );
    expect(
      WineInventoryResponseSchema.safeParse({
        ...response,
        monopolies: [
          {
            monopoly,
            inventory: [
              { date: "2026-07-12", count: 1 },
              { date: "2026-07-11", count: 0 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      WineInventoryResponseSchema.safeParse({
        ...response,
        monopolies: [response.monopolies[0], response.monopolies[0]],
      }).success,
    ).toBe(false);
  });

  it("validates the canonical monopoly inventory response", () => {
    const response = {
      ...freshness,
      monopoly,
      period: { from: "2026-07-12", to: "2026-07-12" },
      wines: [{ wine, inventory: [{ date: "2026-07-12", count: 4 }] }],
    };

    expect(MonopolyInventoryResponseSchema.parse(response)).toEqual(response);
    expectTypeOf(response).toMatchTypeOf<MonopolyInventoryResponse>();
    expect(
      MonopolyInventoryResponseSchema.safeParse({
        ...response,
        wines: [{ wine, inventory: [{ date: "2026-07-12", count: -4 }] }],
      }).success,
    ).toBe(false);
    expect(
      MonopolyInventoryResponseSchema.safeParse({
        ...response,
        wines: [{ wine, inventory: [{ date: "2026-07-13", count: 4 }] }],
      }).success,
    ).toBe(false);
  });

  it("validates daily and summarized portfolio stockout statistics", () => {
    const response = {
      ...freshness,
      period: { from: "2026-07-11", to: "2026-07-12" },
      comparisonDate: "2026-07-10",
      daily: [
        {
          date: "2026-07-11",
          trackedPairs: 20,
          inStockPairs: 18,
          soldOutPairs: 2,
          distinctWinesSoldOut: 1,
          distinctStoresAffected: 2,
          newlySoldOutPairs: 1,
          bottlesLostToStockouts: 3,
          totalBottles: 94,
        },
        {
          date: "2026-07-12",
          trackedPairs: 20,
          inStockPairs: 17,
          soldOutPairs: 3,
          distinctWinesSoldOut: 2,
          distinctStoresAffected: 2,
          newlySoldOutPairs: 2,
          bottlesLostToStockouts: 4,
          totalBottles: 88,
        },
      ],
      summary: {
        observedDays: 2,
        daysWithStockouts: 2,
        trackedPairs: 20,
        stockoutPairDays: 5,
        distinctPairsSoldOut: 4,
        distinctWinesSoldOut: 2,
        distinctStoresAffected: 3,
        newlySoldOutPairs: 3,
        bottlesLostToStockouts: 7,
        averageDailyStockouts: 2.5,
        availabilityRate: 0.875,
        peak: { date: "2026-07-12", soldOutPairs: 3 },
      },
    };

    expect(StatisticsResponseSchema.parse(response)).toEqual(response);
    expectTypeOf(response).toMatchTypeOf<StatisticsResponse>();
    expect(
      StatisticsResponseSchema.safeParse({
        ...response,
        daily: [{ ...response.daily[0], soldOutPairs: 3 }],
      }).success,
    ).toBe(false);
  });
});

describe("catalog and status schemas", () => {
  it("builds reusable and concrete catalog schemas", () => {
    const availability = {
      soldOutAtSomePoint: 2,
      inStockAtSomePoint: 4,
      currentlyInStock: 1,
      bottlesByDate: [
        { date: "2026-07-11", count: 8 },
        { date: "2026-07-12", count: 3 },
      ],
    };
    const numbers = CatalogResponseSchema(z.number().int());
    expect(numbers.parse({ items: [1, 2], nextCursor: "cursor" })).toEqual({
      items: [1, 2],
      nextCursor: "cursor",
    });
    expect(numbers.safeParse({ items: [1], nextCursor: undefined }).success).toBe(false);
    expect(
      WineCatalogResponseSchema.parse({ items: [{ ...wine, availability }], nextCursor: null }),
    ).toEqual({
      items: [{ ...wine, availability }],
      nextCursor: null,
    });
    expect(
      MonopolyCatalogResponseSchema.parse({
        items: [{ ...monopoly, availability }],
        nextCursor: null,
      }),
    ).toEqual({
      items: [{ ...monopoly, availability }],
      nextCursor: null,
    });
    expectTypeOf<CatalogResponse<WineSummary>>().toEqualTypeOf<{
      items: WineSummary[];
      nextCursor: string | null;
    }>();
  });

  it("validates nested freshness and available months", () => {
    const status = {
      freshness,
      availableMonths: ["2024-01", "2024-02", "2026-07"],
      catalog: { wines: 125, monopolies: 342 },
    };
    expect(StatusResponseSchema.parse(status)).toEqual(status);
    expectTypeOf(status).toMatchTypeOf<StatusResponse>();
    expect(
      StatusResponseSchema.parse({
        freshness: null,
        availableMonths: [],
        catalog: { wines: 0, monopolies: 0 },
      }),
    ).toEqual({
      freshness: null,
      availableMonths: [],
      catalog: { wines: 0, monopolies: 0 },
    });
    expect(
      StatusResponseSchema.safeParse({ ...status, availableMonths: ["2024-01", "2024-01"] })
        .success,
    ).toBe(false);
  });
});

describe("queue messages", () => {
  const base = {
    version: 1 as const,
    type: "start-sync" as const,
    trigger: "manual" as const,
    date: "2026-07-13",
  };

  it("accepts the one start-sync message", () => {
    const parsed = SyncQueueMessageSchema.parse(base);
    expect(parsed).toEqual(base);
    expectTypeOf(parsed).toMatchTypeOf<SyncQueueMessage>();
  });

  it("rejects invalid queue metadata", () => {
    expect(SyncQueueMessageSchema.safeParse({ ...base, version: 2 }).success).toBe(false);
    expect(SyncQueueMessageSchema.safeParse({ ...base, trigger: "unknown" }).success).toBe(false);
    expect(SyncQueueMessageSchema.safeParse({ ...base, type: "sync-wine" }).success).toBe(false);
    expect(SyncQueueMessageSchema.safeParse({ ...base, password: "unexpected" }).success).toBe(
      false,
    );
  });
});

describe("admin and error contracts", () => {
  it("validates accepted responses", () => {
    const response = {
      status: "queued" as const,
      date: "2026-07-13",
    };
    expect(AdminAcceptedResponseSchema.parse(response)).toEqual(response);
    expectTypeOf<AdminAcceptedResponse>().toMatchTypeOf<typeof response>();
  });

  it("validates a safe structured API error", () => {
    const response = {
      error: { code: "invalid_period", message: "The period is invalid", requestId: "req-1" },
    };
    expect(ApiErrorResponseSchema.parse(response)).toEqual(response);
    expect(
      ApiErrorResponseSchema.safeParse({
        error: { ...response.error, sql: "SELECT * FROM inventories" },
      }).success,
    ).toBe(false);
  });
});
