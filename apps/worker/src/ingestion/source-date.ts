import { PermanentQueueError } from "../errors";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function sourceBoundsForMonth(month: string): { from: number; through: number } {
  const match = MONTH_PATTERN.exec(month);
  if (match === null) throw new PermanentQueueError(`Invalid sync month: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: year * 10_000 + monthNumber * 100 + 1,
    through: year * 10_000 + monthNumber * 100 + lastDay,
  };
}

export function sourceDateToIso(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new PermanentQueueError(`Inventory date is not an integer: ${String(value)}`);
  }
  const year = Math.trunc(value / 10_000);
  const month = Math.trunc((value % 10_000) / 100);
  const day = value % 100;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new PermanentQueueError(`Invalid inventory date: ${value}`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthFromSourceDate(value: number): string {
  const isoDate = sourceDateToIso(value);
  return isoDate.slice(0, 7);
}
