import type { DailyInventory, Freshness, ISODate, Period } from "../api/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const osloDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const availableDateSets = new WeakMap<readonly string[], ReadonlySet<string>>();

const toIsoDate = (date: Date): ISODate => date.toISOString().slice(0, 10);

export const todayInOslo = (): ISODate => {
  const parts = osloDateFormatter.formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const addDays = (date: ISODate, days: number): ISODate => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toIsoDate(value);
};

export const defaultPeriod = (today = todayInOslo()): Period => {
  return { from: addDays(today, -29), to: today };
};

export const lastTwoMonthsPeriod = (today = todayInOslo()): Period => ({
  from: addDays(today, -59),
  to: today,
});

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

type DateFormatOptions = Omit<Intl.DateTimeFormatOptions, "year"> & { year?: "numeric" | false };

export const formatDate = (date: ISODate, options?: DateFormatOptions): string => {
  const { year: requestedYear, ...dateOptions } = options ?? {};
  const year = requestedYear === false ? undefined : (requestedYear ?? "numeric");
  const formatterOptions: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...dateOptions,
    ...(year === undefined ? {} : { year }),
  };
  const key = JSON.stringify(formatterOptions);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", formatterOptions);
    dateFormatters.set(key, formatter);
  }
  return formatter.format(new Date(`${date}T12:00:00Z`));
};

export const formatMonth = (month: string): string =>
  monthFormatter.format(new Date(`${month}-01T12:00:00Z`));

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
  freshness: Pick<Freshness, "coveredThrough" | "availableDates" | "missingMonths">,
): boolean => {
  if (date > freshness.coveredThrough || freshness.missingMonths?.includes(date.slice(0, 7))) {
    return false;
  }
  const dates = freshness.availableDates;
  if (dates === undefined) return true;
  let dateSet = availableDateSets.get(dates);
  if (!dateSet) {
    dateSet = new Set(dates);
    availableDateSets.set(dates, dateSet);
  }
  return dateSet.has(date);
};

export const availableDates = (
  from: ISODate,
  to: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "availableDates" | "missingMonths">,
): ISODate[] =>
  enumerateDates(from, to).filter((date) => isInventoryDateAvailable(date, freshness));

export const latestAvailableDate = (
  from: ISODate,
  to: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "availableDates" | "missingMonths">,
): ISODate | null => availableDates(from, to, freshness).at(-1) ?? null;

export const latestCount = (inventory: DailyInventory[], to: ISODate): number =>
  inventoryMap(inventory).get(to) ?? 0;

export const wasSoldOutAtSomePoint = (
  inventory: DailyInventory[],
  from: ISODate,
  to: ISODate,
  freshness: Pick<Freshness, "coveredThrough" | "availableDates" | "missingMonths">,
): boolean => {
  const observations = inventoryMap(inventory);
  return availableDates(from, to, freshness).some((date) => (observations.get(date) ?? 0) === 0);
};
