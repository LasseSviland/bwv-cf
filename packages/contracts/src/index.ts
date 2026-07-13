import { z } from "zod";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isCalendarMonth(value: string): boolean {
  const match = MONTH_PATTERN.exec(value);
  if (match === null) return false;

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export type JsonValue = boolean | number | string | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.null(),
    z.array(JsonValueSchema),
    JsonObjectSchema,
  ]),
);
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema);

/** A valid proleptic-Gregorian date serialized as YYYY-MM-DD. */
export const DateStringSchema = z.string().refine(isCalendarDate, {
  message: "Expected a valid date in YYYY-MM-DD format",
});
export type DateString = z.infer<typeof DateStringSchema>;
export const ISODateSchema = DateStringSchema;
export type ISODate = DateString;

/** A valid calendar month serialized as YYYY-MM. */
export const MonthSchema = z.string().refine(isCalendarMonth, {
  message: "Expected a valid month in YYYY-MM format",
});
export type Month = z.infer<typeof MonthSchema>;
export type MonthString = Month;

/** UTC system metadata timestamp. Product dates use DateStringSchema instead. */
export const UtcDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith("Z"), { message: "Expected a UTC timestamp ending in Z" });
export type UtcDateTime = z.infer<typeof UtcDateTimeSchema>;

export const PeriodSchema = z
  .object({
    from: DateStringSchema,
    to: DateStringSchema,
  })
  .strict()
  .refine(({ from, to }) => from <= to, {
    message: "Period start must not be after period end",
    path: ["to"],
  });
export type Period = z.infer<typeof PeriodSchema>;

const EntityIdSchema = z.number().int().safe().positive();
const ExternalNumberSchema = z.string().trim().min(1).max(100);
const DisplayNameSchema = z.string().trim().min(1).max(500);

export const WineSummarySchema = z
  .object({
    id: EntityIdSchema,
    productNumber: ExternalNumberSchema,
    name: DisplayNameSchema,
    country: z.string().trim().min(1).max(200).nullable().optional(),
    wineCategory: z.string().trim().min(1).max(100).nullable().optional(),
    assortment: z.string().trim().min(1).max(200).nullable().optional(),
    assortmentGrades: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict();
export type WineSummary = z.infer<typeof WineSummarySchema>;

export const MonopolySummarySchema = z
  .object({
    id: EntityIdSchema,
    storeNumber: ExternalNumberSchema,
    name: DisplayNameSchema,
    postalCode: z.string().trim().min(1).max(20).nullable().optional(),
    city: z.string().trim().min(1).max(200).nullable().optional(),
    monopolyCategory: z.string().trim().min(1).max(100).nullable().optional(),
    monopolyProfile: z.string().trim().min(1).max(100).nullable().optional(),
    storeAssortment: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();
export type MonopolySummary = z.infer<typeof MonopolySummarySchema>;

export const WineDetailSchema = WineSummarySchema.extend({
  sourceData: JsonObjectSchema,
}).strict();
export type WineDetail = z.infer<typeof WineDetailSchema>;

export const MonopolyDetailSchema = MonopolySummarySchema.extend({
  sourceData: JsonObjectSchema,
}).strict();
export type MonopolyDetail = z.infer<typeof MonopolyDetailSchema>;

export const DailyInventorySchema = z
  .object({
    date: DateStringSchema,
    count: z.number().int().safe().nonnegative(),
  })
  .strict();
export type DailyInventory = z.infer<typeof DailyInventorySchema>;

export const AvailabilitySummarySchema = z
  .object({
    soldOutAtSomePoint: z.number().int().safe().nonnegative(),
    inStockAtSomePoint: z.number().int().safe().nonnegative(),
    currentlyInStock: z.number().int().safe().nonnegative(),
    bottlesByDate: z.array(DailyInventorySchema),
  })
  .strict();
export type AvailabilitySummary = z.infer<typeof AvailabilitySummarySchema>;

export const WineCatalogItemSchema = WineSummarySchema.extend({
  availability: AvailabilitySummarySchema,
}).strict();
export type WineCatalogItem = z.infer<typeof WineCatalogItemSchema>;

export const MonopolyCatalogItemSchema = MonopolySummarySchema.extend({
  availability: AvailabilitySummarySchema,
}).strict();
export type MonopolyCatalogItem = z.infer<typeof MonopolyCatalogItemSchema>;

export const FreshnessSchema = z
  .object({
    datasetGeneratedAt: UtcDateTimeSchema,
    sourceWatermark: z.number().int().safe().nonnegative(),
    coveredThrough: DateStringSchema,
    availableDates: z
      .array(DateStringSchema)
      .refine(hasUniqueValues, { message: "Available dates must be unique" })
      .optional(),
    missingMonths: z
      .array(MonthSchema)
      .refine(hasUniqueValues, { message: "Missing months must be unique" })
      .optional(),
  })
  .strict();
export type Freshness = z.infer<typeof FreshnessSchema>;

export const MonopolyInventorySeriesSchema = z
  .object({
    monopoly: MonopolySummarySchema,
    inventory: z.array(DailyInventorySchema),
  })
  .strict();
export type MonopolyInventorySeries = z.infer<typeof MonopolyInventorySeriesSchema>;

export const WineInventorySeriesSchema = z
  .object({
    wine: WineSummarySchema,
    inventory: z.array(DailyInventorySchema),
  })
  .strict();
export type WineInventorySeries = z.infer<typeof WineInventorySeriesSchema>;

export type WineInventoryEntry = MonopolyInventorySeries;
export type MonopolyInventoryEntry = WineInventorySeries;

function validateResponseSeries(
  inventory: readonly DailyInventory[],
  period: Period,
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  let previousDate: string | undefined;
  inventory.forEach((entry, index) => {
    if (entry.date < period.from || entry.date > period.to) {
      context.addIssue({
        code: "custom",
        message: "Inventory date falls outside the response period",
        path: [...path, index, "date"],
      });
    }
    if (previousDate !== undefined && entry.date <= previousDate) {
      context.addIssue({
        code: "custom",
        message: "Inventory dates must be unique and sorted in ascending order",
        path: [...path, index, "date"],
      });
    }
    previousDate = entry.date;
  });
}

export const WineInventoryResponseSchema = FreshnessSchema.extend({
  wine: WineSummarySchema,
  period: PeriodSchema,
  monopolies: z.array(MonopolyInventorySeriesSchema),
})
  .strict()
  .superRefine((response, context) => {
    const monopolyIds = new Set<number>();
    response.monopolies.forEach((entry, index) => {
      if (monopolyIds.has(entry.monopoly.id)) {
        context.addIssue({
          code: "custom",
          message: "A monopoly may appear only once in a wine inventory response",
          path: ["monopolies", index, "monopoly", "id"],
        });
      }
      monopolyIds.add(entry.monopoly.id);
      validateResponseSeries(entry.inventory, response.period, context, [
        "monopolies",
        index,
        "inventory",
      ]);
    });
  });
export type WineInventoryResponse = z.infer<typeof WineInventoryResponseSchema>;

export const MonopolyInventoryResponseSchema = FreshnessSchema.extend({
  monopoly: MonopolySummarySchema,
  period: PeriodSchema,
  wines: z.array(WineInventorySeriesSchema),
})
  .strict()
  .superRefine((response, context) => {
    const wineIds = new Set<number>();
    response.wines.forEach((entry, index) => {
      if (wineIds.has(entry.wine.id)) {
        context.addIssue({
          code: "custom",
          message: "A wine may appear only once in a monopoly inventory response",
          path: ["wines", index, "wine", "id"],
        });
      }
      wineIds.add(entry.wine.id);
      validateResponseSeries(entry.inventory, response.period, context, [
        "wines",
        index,
        "inventory",
      ]);
    });
  });
export type MonopolyInventoryResponse = z.infer<typeof MonopolyInventoryResponseSchema>;

export const DailyStockoutStatisticsSchema = z
  .object({
    date: DateStringSchema,
    trackedPairs: z.number().int().safe().nonnegative(),
    inStockPairs: z.number().int().safe().nonnegative(),
    soldOutPairs: z.number().int().safe().nonnegative(),
    distinctWinesSoldOut: z.number().int().safe().nonnegative(),
    distinctStoresAffected: z.number().int().safe().nonnegative(),
    newlySoldOutPairs: z.number().int().safe().nonnegative(),
    bottlesLostToStockouts: z.number().int().safe().nonnegative(),
    totalBottles: z.number().int().safe().nonnegative(),
  })
  .strict()
  .refine(
    ({ trackedPairs, inStockPairs, soldOutPairs }) => {
      return inStockPairs + soldOutPairs === trackedPairs;
    },
    {
      message: "In-stock and sold-out pairs must equal tracked pairs",
      path: ["soldOutPairs"],
    },
  );
export type DailyStockoutStatistics = z.infer<typeof DailyStockoutStatisticsSchema>;

export const StockoutSummarySchema = z
  .object({
    observedDays: z.number().int().safe().nonnegative(),
    daysWithStockouts: z.number().int().safe().nonnegative(),
    trackedPairs: z.number().int().safe().nonnegative(),
    stockoutPairDays: z.number().int().safe().nonnegative(),
    distinctPairsSoldOut: z.number().int().safe().nonnegative(),
    distinctWinesSoldOut: z.number().int().safe().nonnegative(),
    distinctStoresAffected: z.number().int().safe().nonnegative(),
    newlySoldOutPairs: z.number().int().safe().nonnegative(),
    bottlesLostToStockouts: z.number().int().safe().nonnegative(),
    averageDailyStockouts: z.number().finite().nonnegative(),
    availabilityRate: z.number().finite().min(0).max(1),
    peak: z
      .object({
        date: DateStringSchema,
        soldOutPairs: z.number().int().safe().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(({ daysWithStockouts, observedDays }) => daysWithStockouts <= observedDays, {
    message: "Days with stockouts cannot exceed observed days",
    path: ["daysWithStockouts"],
  });
export type StockoutSummary = z.infer<typeof StockoutSummarySchema>;

export const StatisticsResponseSchema = FreshnessSchema.extend({
  period: PeriodSchema,
  comparisonDate: DateStringSchema.nullable(),
  daily: z.array(DailyStockoutStatisticsSchema),
  summary: StockoutSummarySchema,
})
  .strict()
  .superRefine((response, context) => {
    let previousDate: string | undefined;
    response.daily.forEach((entry, index) => {
      if (entry.date < response.period.from || entry.date > response.period.to) {
        context.addIssue({
          code: "custom",
          message: "Statistics date falls outside the response period",
          path: ["daily", index, "date"],
        });
      }
      if (previousDate !== undefined && entry.date <= previousDate) {
        context.addIssue({
          code: "custom",
          message: "Statistics dates must be unique and sorted in ascending order",
          path: ["daily", index, "date"],
        });
      }
      previousDate = entry.date;
    });
    if (response.summary.observedDays !== response.daily.length) {
      context.addIssue({
        code: "custom",
        message: "Observed days must match the daily statistics length",
        path: ["summary", "observedDays"],
      });
    }
  });
export type StatisticsResponse = z.infer<typeof StatisticsResponseSchema>;

export type CatalogResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

export function CatalogResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: z.string().min(1).nullable(),
    })
    .strict();
}

/** Lower-camel alias for callers that prefer factory naming conventions. */
export const createCatalogResponseSchema = CatalogResponseSchema;

export const WineCatalogResponseSchema = CatalogResponseSchema(WineCatalogItemSchema);
export type WineCatalogResponse = z.infer<typeof WineCatalogResponseSchema>;

export const MonopolyCatalogResponseSchema = CatalogResponseSchema(MonopolyCatalogItemSchema);
export type MonopolyCatalogResponse = z.infer<typeof MonopolyCatalogResponseSchema>;

export const StatusResponseSchema = z
  .object({
    freshness: FreshnessSchema.nullable(),
    availableMonths: z
      .array(MonthSchema)
      .refine(hasUniqueValues, { message: "Available months must be unique" }),
    catalog: z
      .object({
        wines: z.number().int().safe().nonnegative(),
        monopolies: z.number().int().safe().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const SyncTriggerSchema = z.enum(["scheduled", "manual"]);
export type SyncTrigger = z.infer<typeof SyncTriggerSchema>;

const QueueBaseSchema = z
  .object({
    version: z.literal(1),
    trigger: SyncTriggerSchema,
    date: DateStringSchema,
  })
  .strict();

export const SyncQueueMessageSchema = QueueBaseSchema.extend({
  type: z.literal("start-sync"),
}).strict();
export type SyncQueueMessage = z.infer<typeof SyncQueueMessageSchema>;

export const AdminAcceptedResponseSchema = z
  .object({
    status: z.literal("queued"),
    date: DateStringSchema,
  })
  .strict();
export type AdminAcceptedResponse = z.infer<typeof AdminAcceptedResponseSchema>;

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(1_000),
        requestId: z.string().min(1).max(200),
      })
      .strict(),
  })
  .strict();
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
