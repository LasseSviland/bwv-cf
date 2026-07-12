import type { DailyInventory, Freshness, ISODate } from "../api/types";
import {
  enumerateDates,
  formatDate,
  formatMonth,
  groupDatesByMonth,
  inventoryMap,
  isInventoryDateAvailable,
} from "../utils/dates";
import { StockLegend } from "./StockLegend";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface InventoryCalendarProps {
  inventory: DailyInventory[];
  from: ISODate;
  to: ISODate;
  freshness: Pick<Freshness, "coveredThrough" | "missingMonths">;
}

const monthCells = (month: string): Array<ISODate | null> => {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getDate();
  const cells: Array<ISODate | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const InventoryCalendar = ({ inventory, from, to, freshness }: InventoryCalendarProps) => {
  const observations = inventoryMap(inventory);
  const months = groupDatesByMonth(enumerateDates(from, to)).map((group) => group.month);
  const uniqueMonths = [...new Set(months.length > 0 ? months : [from.slice(0, 7)])];

  return (
    <section className="calendar-view" aria-label="Daily inventory calendar">
      <div className="calendar-view__header">
        <div>
          <p className="eyebrow">Day-by-day calendar</p>
          <p>Every selected day is marked as in stock or sold out.</p>
        </div>
        <StockLegend />
      </div>
      <div className="calendar-list">
        {uniqueMonths.map((month) => (
          <section className="month-calendar" key={month} aria-labelledby={`month-${month}`}>
            <h2 id={`month-${month}`}>{formatMonth(month)}</h2>
            <div className="month-calendar__grid month-calendar__weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="month-calendar__grid">
              {monthCells(month).map((date, index) => {
                if (!date)
                  return (
                    <span className="calendar-day calendar-day--blank" key={`blank-${index}`} />
                  );
                if (date < from || date > to) {
                  return (
                    <span
                      className="calendar-day calendar-day--outside"
                      key={date}
                      aria-hidden="true"
                    >
                      <span className="calendar-day__number">{Number(date.slice(-2))}</span>
                    </span>
                  );
                }
                const available = isInventoryDateAvailable(date, freshness);
                const count = observations.get(date) ?? 0;
                const inStock = count > 0;
                const label = available
                  ? `${formatDate(date)}: ${inStock ? `${count} bottle${count === 1 ? "" : "s"} in stock` : "sold out"}`
                  : `${formatDate(date)}: data unavailable`;
                return (
                  <span
                    className={
                      !available
                        ? "calendar-day calendar-day--unknown"
                        : inStock
                          ? "calendar-day calendar-day--in"
                          : "calendar-day calendar-day--out"
                    }
                    key={date}
                    aria-label={label}
                    title={label}
                  >
                    <span className="calendar-day__number">{Number(date.slice(-2))}</span>
                    <strong>{available ? (inStock ? count : "—") : "?"}</strong>
                    <span className="calendar-day__status">
                      {available ? (inStock ? "In stock" : "Sold out") : "Unavailable"}
                    </span>
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};
