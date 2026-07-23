import {
  DailyInventorySchema,
  DateStringSchema,
  MonthSchema,
  PeriodSchema,
  type DailyInventory,
  type DateString,
  type Month,
  type Period,
} from "@bwv/contracts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_DATE_ENUMERATION = 10_000;
const MAX_MONTH_ENUMERATION = 1_200;
const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2_048;
const MAX_CURSOR_QUERY_LENGTH = 500;

const SEARCH_TRANSLITERATIONS: Readonly<Record<string, string>> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ƒ: "f",
  ħ: "h",
  ı: "i",
  ł: "l",
  ŋ: "n",
  ø: "o",
  œ: "oe",
  ß: "ss",
  ŧ: "t",
  þ: "th",
};

/**
 * Produces the same accent-insensitive search representation in browsers and Workers.
 * NFKD handles composed characters and compatibility forms; the explicit map covers
 * common Latin letters which Unicode does not decompose into an ASCII base letter.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[æđðƒħıłŋøœßŧþ]/gu, (character) => SEARCH_TRANSLITERATIONS[character] ?? character)
    .replace(/['’‘ʻʼʹ＇]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const OSLO_TIME_ZONE = "Europe/Oslo";
export const DEFAULT_MAX_PERIOD_DAYS = 366;

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface CalendarMonthParts {
  year: number;
  month: number;
}

export class CalendarFormatError extends RangeError {
  override readonly name = "CalendarFormatError";
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInCalendarMonth(year: number, month: number): number {
  if (!Number.isSafeInteger(year) || year < 0 || year > 9_999) {
    throw new CalendarFormatError("Year must be an integer between 0000 and 9999");
  }
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new CalendarFormatError("Month must be an integer between 1 and 12");
  }

  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] as number;
}

export function isDateString(value: unknown): value is DateString {
  return DateStringSchema.safeParse(value).success;
}

export function parseDateString(value: string): CalendarDateParts {
  if (!isDateString(value)) {
    throw new CalendarFormatError("Invalid calendar date");
  }

  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new CalendarFormatError(`Invalid calendar date: ${value}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export const parseDate = parseDateString;

export function formatDateString(parts: CalendarDateParts): DateString {
  if (!Number.isSafeInteger(parts.year) || parts.year < 0 || parts.year > 9_999) {
    throw new CalendarFormatError("Year must be an integer between 0000 and 9999");
  }
  if (!Number.isSafeInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    throw new CalendarFormatError("Month must be an integer between 1 and 12");
  }
  if (
    !Number.isSafeInteger(parts.day) ||
    parts.day < 1 ||
    parts.day > daysInCalendarMonth(parts.year, parts.month)
  ) {
    throw new CalendarFormatError("Day is outside the selected calendar month");
  }

  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export const formatDate = formatDateString;

function dateToEpochDay(value: DateString): number {
  const { year, month, day } = parseDateString(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.floor(date.getTime() / MILLISECONDS_PER_DAY);
}

function epochDayToDate(epochDay: number): DateString {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY);
  if (Number.isNaN(date.getTime())) {
    throw new CalendarFormatError("Date falls outside the supported range");
  }
  return formatDateString({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function compareDateStrings(left: DateString, right: DateString): -1 | 0 | 1 {
  parseDateString(left);
  parseDateString(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addDays(value: DateString, amount: number): DateString {
  if (!Number.isSafeInteger(amount)) {
    throw new CalendarFormatError("Day offset must be a safe integer");
  }
  return epochDayToDate(dateToEpochDay(value) + amount);
}

export function inclusiveDayCount(from: DateString, to: DateString): number {
  const difference = dateToEpochDay(to) - dateToEpochDay(from);
  if (difference < 0) {
    throw new CalendarFormatError("Start date must not be after end date");
  }
  return difference + 1;
}

export function enumerateDates(
  from: DateString,
  to: DateString,
  maximumItems = MAX_DATE_ENUMERATION,
): DateString[] {
  if (!Number.isSafeInteger(maximumItems) || maximumItems < 1) {
    throw new CalendarFormatError("Date enumeration limit must be a positive safe integer");
  }

  const count = inclusiveDayCount(from, to);
  if (count > maximumItems) {
    throw new CalendarFormatError(`Date range contains ${count} days; limit is ${maximumItems}`);
  }

  const firstDay = dateToEpochDay(from);
  return Array.from({ length: count }, (_, index) => epochDayToDate(firstDay + index));
}

export function isMonthString(value: unknown): value is Month {
  return MonthSchema.safeParse(value).success;
}

export function parseMonth(value: string): CalendarMonthParts {
  if (!isMonthString(value)) {
    throw new CalendarFormatError("Invalid calendar month");
  }

  const match = MONTH_PATTERN.exec(value);
  if (match === null) throw new CalendarFormatError(`Invalid calendar month: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatMonth(parts: CalendarMonthParts): Month {
  if (!Number.isSafeInteger(parts.year) || parts.year < 0 || parts.year > 9_999) {
    throw new CalendarFormatError("Year must be an integer between 0000 and 9999");
  }
  if (!Number.isSafeInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    throw new CalendarFormatError("Month must be an integer between 1 and 12");
  }
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}`;
}

function monthToIndex(value: Month): number {
  const { year, month } = parseMonth(value);
  return year * 12 + month - 1;
}

function indexToMonth(index: number): Month {
  if (!Number.isSafeInteger(index) || index < 0 || index > 9_999 * 12 + 11) {
    throw new CalendarFormatError("Month falls outside the supported range");
  }
  return formatMonth({ year: Math.floor(index / 12), month: (index % 12) + 1 });
}

export function compareMonths(left: Month, right: Month): -1 | 0 | 1 {
  parseMonth(left);
  parseMonth(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addMonths(value: Month, amount: number): Month {
  if (!Number.isSafeInteger(amount)) {
    throw new CalendarFormatError("Month offset must be a safe integer");
  }
  return indexToMonth(monthToIndex(value) + amount);
}

export function enumerateMonths(
  from: Month,
  through: Month,
  maximumItems = MAX_MONTH_ENUMERATION,
): Month[] {
  if (!Number.isSafeInteger(maximumItems) || maximumItems < 1) {
    throw new CalendarFormatError("Month enumeration limit must be a positive safe integer");
  }

  const first = monthToIndex(from);
  const last = monthToIndex(through);
  if (first > last) throw new CalendarFormatError("Start month must not be after end month");
  const count = last - first + 1;
  if (count > maximumItems) {
    throw new CalendarFormatError(`Month range contains ${count} months; limit is ${maximumItems}`);
  }

  return Array.from({ length: count }, (_, index) => indexToMonth(first + index));
}

export function monthForDate(value: DateString): Month {
  const { year, month } = parseDateString(value);
  return formatMonth({ year, month });
}

export function firstDateOfMonth(value: Month): DateString {
  const { year, month } = parseMonth(value);
  return formatDateString({ year, month, day: 1 });
}

export function lastDateOfMonth(value: Month): DateString {
  const { year, month } = parseMonth(value);
  return formatDateString({ year, month, day: daysInCalendarMonth(year, month) });
}

export function monthsForPeriod(period: Period): Month[] {
  const validPeriod = PeriodSchema.parse(period);
  return enumerateMonths(monthForDate(validPeriod.from), monthForDate(validPeriod.to));
}

const osloDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OSLO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateInOslo(instant: Date = new Date()): DateString {
  if (Number.isNaN(instant.getTime())) {
    throw new CalendarFormatError("Expected a valid instant");
  }

  const parts = osloDateFormatter.formatToParts(instant);
  const year = Number(parts.find(({ type }) => type === "year")?.value);
  const month = Number(parts.find(({ type }) => type === "month")?.value);
  const day = Number(parts.find(({ type }) => type === "day")?.value);
  return formatDateString({ year, month, day });
}

export function currentMonthInOslo(instant: Date = new Date()): Month {
  return monthForDate(dateInOslo(instant));
}

export function previousMonthInOslo(instant: Date = new Date()): Month {
  return addMonths(currentMonthInOslo(instant), -1);
}

/** Returns the normal refresh months in chronological order: previous, then current. */
export function currentAndPreviousMonthsInOslo(instant: Date = new Date()): [Month, Month] {
  const current = currentMonthInOslo(instant);
  return [addMonths(current, -1), current];
}

export function defaultPeriodInOslo(instant: Date = new Date()): Period {
  const today = dateInOslo(instant);
  return {
    from: addDays(today, -29),
    to: today,
  };
}

export type QueryPeriodErrorCode =
  "invalid_from" | "invalid_to" | "from_after_to" | "future_date" | "range_too_large";

export class QueryPeriodError extends RangeError {
  override readonly name = "QueryPeriodError";

  constructor(
    readonly code: QueryPeriodErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface QueryPeriodInput {
  from?: string | null;
  to?: string | null;
}

export interface QueryPeriodOptions {
  now?: Date;
  maxDays?: number;
}

export function validateQueryPeriod(
  input: QueryPeriodInput = {},
  options: QueryPeriodOptions = {},
): Period {
  const now = options.now ?? new Date();
  const maximumDays = options.maxDays ?? DEFAULT_MAX_PERIOD_DAYS;
  if (!Number.isSafeInteger(maximumDays) || maximumDays < 1) {
    throw new RangeError("maxDays must be a positive safe integer");
  }

  const defaults = defaultPeriodInOslo(now);
  const from = input.from ?? defaults.from;
  const to = input.to ?? defaults.to;

  if (!isDateString(from)) {
    throw new QueryPeriodError("invalid_from", "from must be a valid YYYY-MM-DD date");
  }
  if (!isDateString(to)) {
    throw new QueryPeriodError("invalid_to", "to must be a valid YYYY-MM-DD date");
  }
  if (from > to) {
    throw new QueryPeriodError("from_after_to", "from must not be after to");
  }

  const today = dateInOslo(now);
  if (to > today) {
    throw new QueryPeriodError("future_date", "The requested period must not include future dates");
  }

  const dayCount = inclusiveDayCount(from, to);
  if (dayCount > maximumDays) {
    throw new QueryPeriodError(
      "range_too_large",
      `The requested period contains ${dayCount} days; the maximum is ${maximumDays}`,
    );
  }

  return { from, to };
}

export type QueryPeriodValidationResult =
  { success: true; period: Period } | { success: false; error: QueryPeriodError };

export function safeValidateQueryPeriod(
  input: QueryPeriodInput = {},
  options: QueryPeriodOptions = {},
): QueryPeriodValidationResult {
  try {
    return { success: true, period: validateQueryPeriod(input, options) };
  } catch (error) {
    if (error instanceof QueryPeriodError) return { success: false, error };
    throw error;
  }
}

export type InventoryConflictStrategy = "last" | "first" | "error";

export interface MergeSparseInventoryOptions {
  onConflict?: InventoryConflictStrategy;
}

export function mergeSparseInventorySeries(
  series: readonly (readonly DailyInventory[])[],
  options: MergeSparseInventoryOptions = {},
): DailyInventory[] {
  const strategy = options.onConflict ?? "last";
  if (strategy !== "last" && strategy !== "first" && strategy !== "error") {
    throw new RangeError(`Unsupported inventory conflict strategy: ${String(strategy)}`);
  }
  const merged = new Map<DateString, number>();

  for (const entries of series) {
    for (const candidate of entries) {
      const entry = DailyInventorySchema.parse(candidate);
      const existing = merged.get(entry.date);
      if (existing === undefined || existing === entry.count) {
        merged.set(entry.date, entry.count);
        continue;
      }

      if (strategy === "error") {
        throw new RangeError(`Conflicting inventory counts for ${entry.date}`);
      }
      if (strategy === "last") merged.set(entry.date, entry.count);
    }
  }

  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));
}

/** Concise alias used by API assembly code. */
export const mergeSparseSeries = mergeSparseInventorySeries;

export interface ZeroFillInventoryOptions extends MergeSparseInventoryOptions {
  maxDays?: number;
}

export function zeroFillInventorySeries(
  sparse: readonly DailyInventory[],
  period: Period,
  options: ZeroFillInventoryOptions = {},
): DailyInventory[] {
  const validPeriod = PeriodSchema.parse(period);
  const merged = mergeSparseInventorySeries([sparse], options);
  const byDate = new Map(merged.map((entry) => [entry.date, entry.count]));
  return enumerateDates(
    validPeriod.from,
    validPeriod.to,
    options.maxDays ?? MAX_DATE_ENUMERATION,
  ).map((date) => ({ date, count: byDate.get(date) ?? 0 }));
}

export const zeroFillSeries = zeroFillInventorySeries;

export function mergeAndZeroFillInventorySeries(
  series: readonly (readonly DailyInventory[])[],
  period: Period,
  options: ZeroFillInventoryOptions = {},
): DailyInventory[] {
  return zeroFillInventorySeries(mergeSparseInventorySeries(series, options), period, options);
}

export interface CatalogCursor {
  offset: number;
  query?: string;
}

export class CursorError extends Error {
  override readonly name = "CursorError";
}

function validateCatalogCursor(cursor: CatalogCursor): void {
  if (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
    throw new CursorError("Cursor offset must be a non-negative safe integer");
  }
  if (cursor.query !== undefined) {
    if (typeof cursor.query !== "string" || cursor.query.length > MAX_CURSOR_QUERY_LENGTH) {
      throw new CursorError(
        `Cursor query must contain at most ${MAX_CURSOR_QUERY_LENGTH} characters`,
      );
    }
  }
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): string {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new CursorError("Cursor is not valid base64url data");
  }

  const remainder = value.length % 4;
  if (remainder === 1) throw new CursorError("Cursor is not valid base64url data");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - remainder) % 4)}`;

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CursorError("Cursor is not valid base64url data");
  }
}

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  validateCatalogCursor(cursor);
  const payload =
    cursor.query === undefined
      ? [CURSOR_VERSION, cursor.offset]
      : [CURSOR_VERSION, cursor.offset, cursor.query];
  return toBase64Url(JSON.stringify(payload));
}

export function decodeCatalogCursor(value: string): CatalogCursor {
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(value));
  } catch (error) {
    if (error instanceof CursorError) throw error;
    throw new CursorError("Cursor payload is not valid JSON");
  }

  if (!Array.isArray(payload) || (payload.length !== 2 && payload.length !== 3)) {
    throw new CursorError("Cursor payload has an unsupported shape");
  }
  if (payload[0] !== CURSOR_VERSION) {
    throw new CursorError("Cursor version is not supported");
  }

  const values = payload as unknown[];
  const offset = values[1];
  const query = values[2];
  if (typeof offset !== "number") throw new CursorError("Cursor offset is invalid");
  if (query !== undefined && typeof query !== "string") {
    throw new CursorError("Cursor query is invalid");
  }

  const cursor: CatalogCursor = query === undefined ? { offset } : { offset, query };
  validateCatalogCursor(cursor);
  return cursor;
}

export const encodeCursor = encodeCatalogCursor;
export const decodeCursor = decodeCatalogCursor;

/**
 * Resolves a query cursor and prevents a cursor issued for one search term from
 * being silently reused for another search.
 */
export function resolveCatalogCursor(value: string | null | undefined, query = ""): CatalogCursor {
  if (value === null || value === undefined) return { offset: 0, query };
  const cursor = decodeCatalogCursor(value);
  if ((cursor.query ?? "") !== query) {
    throw new CursorError("Cursor does not belong to this catalog query");
  }
  return cursor.query === undefined ? { offset: cursor.offset } : cursor;
}

export function nextCatalogCursor(
  currentOffset: number,
  returnedItems: number,
  hasMore: boolean,
  query = "",
): string | null {
  if (!Number.isSafeInteger(currentOffset) || currentOffset < 0) {
    throw new CursorError("Current offset must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(returnedItems) || returnedItems < 0) {
    throw new CursorError("Returned item count must be a non-negative safe integer");
  }
  if (!hasMore) return null;
  return encodeCatalogCursor({ offset: currentOffset + returnedItems, query });
}
