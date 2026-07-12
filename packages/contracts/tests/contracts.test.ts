import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  AdminAcceptedResponseSchema,
  AdminBackfillRequestSchema,
  AdminSyncRequestSchema,
  ApiErrorResponseSchema,
  CatalogResponseSchema,
  DailyInventorySchema,
  DateStringSchema,
  FreshnessSchema,
  MonopolyCatalogResponseSchema,
  MonopolyInventoryResponseSchema,
  MonopolySummarySchema,
  MonthSchema,
  PeriodSchema,
  StatusResponseSchema,
  SyncQueueMessageSchema,
  UtcDateTimeSchema,
  WineCatalogResponseSchema,
  WineInventoryResponseSchema,
  WineSummarySchema,
  type AdminAcceptedResponse,
  type CatalogResponse,
  type MonopolyInventoryResponse,
  type StatusResponse,
  type SyncQueueMessage,
  type WineInventoryResponse,
  type WineSummary,
} from "../src/index.js";

const wine = {
  id: 17,
  productNumber: "001234",
  name: "Fjordglimt Riesling",
  country: "Tyskland",
};

const monopoly = {
  id: 31,
  storeNumber: "104",
  name: "Oslo, Aker Brygge",
  postalCode: "0250",
  city: "Oslo",
};

const freshness = {
  datasetGeneratedAt: "2026-07-12T08:30:00.000Z",
  sourceWatermark: 8_089_764,
  coveredThrough: "2026-07-12",
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
  });

  it("rejects invalid identifiers, blank fields, and extra fields while accepting source nulls", () => {
    expect(WineSummarySchema.safeParse({ ...wine, id: 0 }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, name: " " }).success).toBe(false);
    expect(WineSummarySchema.safeParse({ ...wine, country: null }).success).toBe(true);
    expect(WineSummarySchema.safeParse({ ...wine, secret: "no" }).success).toBe(false);
    expect(MonopolySummarySchema.safeParse({ ...monopoly, postalCode: "" }).success).toBe(false);
    expect(
      MonopolySummarySchema.safeParse({ ...monopoly, postalCode: null, city: null }).success,
    ).toBe(true);
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
    jobId: "job-2026-07",
    trigger: "manual" as const,
    month: "2026-07",
    generation: "generation-01",
  };

  it.each([
    { phase: "extract", cursorId: 12, ceilingId: 9_000_000 },
    { phase: "project-wines", bucket: 0 },
    { phase: "project-monopolies", bucket: 4 },
    { phase: "publish" },
    { phase: "refresh-catalogs" },
  ] as const)("accepts a $phase message", (phaseFields) => {
    const parsed = SyncQueueMessageSchema.parse({ ...base, ...phaseFields });
    expect(parsed.phase).toBe(phaseFields.phase);
    expectTypeOf(parsed).toMatchTypeOf<SyncQueueMessage>();
  });

  it("requires an ordered historic range for bootstrap bounds", () => {
    expect(
      SyncQueueMessageSchema.parse({
        ...base,
        trigger: "backfill",
        phase: "bootstrap-bounds",
        fromMonth: "2024-01",
        throughMonth: "2026-07",
      }),
    ).toMatchObject({ phase: "bootstrap-bounds", fromMonth: "2024-01" });

    expect(SyncQueueMessageSchema.safeParse({ ...base, phase: "bootstrap-bounds" }).success).toBe(
      false,
    );
    expect(
      SyncQueueMessageSchema.safeParse({
        ...base,
        phase: "bootstrap-bounds",
        fromMonth: "2026-07",
        throughMonth: "2024-01",
      }).success,
    ).toBe(false);
  });

  it("keeps bootstrap range fields off all other phases", () => {
    expect(
      SyncQueueMessageSchema.safeParse({
        ...base,
        phase: "extract",
        fromMonth: "2024-01",
        throughMonth: "2026-07",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid queue metadata", () => {
    expect(
      SyncQueueMessageSchema.safeParse({ ...base, version: 2, phase: "publish" }).success,
    ).toBe(false);
    expect(
      SyncQueueMessageSchema.safeParse({ ...base, trigger: "unknown", phase: "publish" }).success,
    ).toBe(false);
    expect(
      SyncQueueMessageSchema.safeParse({ ...base, phase: "extract", cursorId: -1 }).success,
    ).toBe(false);
    expect(
      SyncQueueMessageSchema.safeParse({ ...base, phase: "publish", password: "unexpected" })
        .success,
    ).toBe(false);
  });
});

describe("admin and error contracts", () => {
  it("validates explicit sync month requests", () => {
    expect(AdminSyncRequestSchema.parse({ months: ["2024-01", "2024-02"] })).toEqual({
      months: ["2024-01", "2024-02"],
    });
    expect(AdminSyncRequestSchema.safeParse({ months: [] }).success).toBe(false);
    expect(AdminSyncRequestSchema.safeParse({ months: ["2024-01", "2024-01"] }).success).toBe(
      false,
    );
    expect(
      AdminSyncRequestSchema.safeParse({
        months: Array.from({ length: 101 }, (_, index) => `2024-${index}`),
      }).success,
    ).toBe(false);
  });

  it("validates optional ordered backfill bounds", () => {
    expect(AdminBackfillRequestSchema.parse({})).toEqual({});
    expect(
      AdminBackfillRequestSchema.parse({ fromMonth: "2024-01", throughMonth: "2026-07" }),
    ).toEqual({ fromMonth: "2024-01", throughMonth: "2026-07" });
    expect(
      AdminBackfillRequestSchema.safeParse({ fromMonth: "2026-07", throughMonth: "2024-01" })
        .success,
    ).toBe(false);
  });

  it("validates accepted responses", () => {
    const response = {
      jobId: "job-1",
      status: "queued" as const,
      months: ["2026-06", "2026-07"],
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
