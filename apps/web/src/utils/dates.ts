import type { DailyInventory, Freshness, ISODate, Period } from "../api/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDate = (date: Date): ISODate => date.toISOString().slice(0, 10);

export const todayInOslo = (): ISODate => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const addDays = (date: ISODate, days: number): ISODate => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toIsoDate(value);
};

export const startOfMonth = (date: ISODate): ISODate => `${date.slice(0, 7)}-01`;

export const defaultPeriod = (today = todayInOslo()): Period => {
  const currentStart = new Date(`${startOfMonth(today)}T12:00:00Z`);
  currentStart.setUTCMonth(currentStart.getUTCMonth() - 1);
  return { from: toIsoDate(currentStart), to: today };
};

export const currentMonthPeriod = (today = todayInOslo()): Period => ({
  from: startOfMonth(today),
  to: today,
});

export const previousMonthPeriod = (today = todayInOslo()): Period => {
  const currentStart = new Date(`${startOfMonth(today)}T12:00:00Z`);
  const previousStart = new Date(currentStart);
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  return { from: toIsoDate(previousStart), to: toIsoDate(previousEnd) };
};

export const yearToDatePeriod = (today = todayInOslo()): Period => ({
  from: `${today.slice(0, 4)}-01-01`,
  to: today,
});

export const isValidPeriod = (period: Period): boolean =>
  ISO_DATE_PATTERN.test(period.from) &&
  ISO_DATE_PATTERN.test(period.to) &&
  period.from <= period.to &&
  period.to <= todayInOslo();

export const enumerateDates = (from: ISODate, to: ISODate): ISODate[] => {
  if (!ISO_DATE_PATTERN.test(from) || !ISO_DATE_PATTERN.test(to) || from > to) return [];
  const dates: ISODate[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < 1_500) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
};

export const inventoryMap = (inventory: DailyInventory[]): Map<ISODate, number> =>
  new Map(inventory.map((observation) => [observation.date, observation.count]));

export const formatDate = (date: ISODate, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));

export const formatMonth = (month: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));

export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export interface MonthGroup {
  month: string;
  dates: ISODate[];
}

export const groupDatesByMonth = (dates: ISODate[]): MonthGroup[] => {
  const groups: MonthGroup[] = [];
  for (const date of dates) {
    const month = date.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.dates.push(date);
    else groups.push({ month, dates: [date] });
  }
  return groups;
};

export const stockDays = (inventory: DailyInventory[]): number =>
  inventory.reduce((total, observation) => total + (observation.count > 0 ? 1 : 0), 0);

export const isInventoryDateAvailable = (
  date: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "missingMonths">,
): boolean =>
  date <= freshness.coveredThrough && !freshness.missingMonths?.includes(date.slice(0, 7));

export const availableDates = (
  from: ISODate,
  to: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "missingMonths">,
): ISODate[] =>
  enumerateDates(from, to).filter((date) => isInventoryDateAvailable(date, freshness));

export const latestAvailableDate = (
  from: ISODate,
  to: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "missingMonths">,
): ISODate | null => availableDates(from, to, freshness).at(-1) ?? null;

export const latestCount = (inventory: DailyInventory[], to: ISODate): number =>
  inventoryMap(inventory).get(to) ?? 0;

export const isFreshnessStale = (coveredThrough: ISODate): boolean =>
  coveredThrough < addDays(todayInOslo(), -1);
