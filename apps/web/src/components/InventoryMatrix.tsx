import { Link } from "react-router-dom";
import type { DailyInventory, Freshness, ISODate } from "../api/types";
import {
  enumerateDates,
  formatDate,
  formatMonth,
  groupDatesByMonth,
  inventoryMap,
  isInventoryDateAvailable,
  latestCount,
  stockDays,
} from "../utils/dates";
import { EmptyState } from "./AsyncState";
import { StockLegend } from "./StockLegend";

export interface InventoryRow {
  id: string;
  label: string;
  secondary: string;
  inventory: DailyInventory[];
  href: string;
}

interface InventoryMatrixProps {
  rows: InventoryRow[];
  from: ISODate;
  to: ISODate;
  entityLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  freshness: Pick<Freshness, "coveredThrough" | "missingMonths">;
}

const dayParts = (date: ISODate) => ({
  weekday: new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .slice(0, 2),
  day: String(Number(date.slice(-2))),
});

export const InventoryMatrix = ({
  rows,
  from,
  to,
  entityLabel,
  emptyTitle,
  emptyDescription,
  freshness,
}: InventoryMatrixProps) => {
  const dates = enumerateDates(from, to);
  const monthGroups = groupDatesByMonth(dates);

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <section className="inventory-view" aria-label={`Daily availability by ${entityLabel}`}>
      <div className="inventory-view__toolbar">
        <div>
          <p className="eyebrow">Daily availability</p>
          <p className="inventory-view__hint">Scroll horizontally to move through the period.</p>
        </div>
        <StockLegend />
      </div>

      <div
        className="matrix-shell desktop-matrix"
        tabIndex={0}
        aria-label="Scrollable daily inventory table"
      >
        <table className="inventory-matrix">
          <thead>
            <tr className="matrix-month-row">
              <th className="matrix-entity-heading" rowSpan={2} scope="col">
                {entityLabel}
              </th>
              {monthGroups.map((group) => (
                <th key={group.month} colSpan={group.dates.length} scope="colgroup">
                  {formatMonth(group.month)}
                </th>
              ))}
            </tr>
            <tr className="matrix-day-row">
              {dates.map((date) => {
                const parts = dayParts(date);
                return (
                  <th key={date} scope="col" title={formatDate(date)}>
                    <span>{parts.weekday}</span>
                    <strong>{parts.day}</strong>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const observations = inventoryMap(row.inventory);
              return (
                <tr key={row.id}>
                  <th className="matrix-entity" scope="row">
                    <Link to={row.href}>{row.label}</Link>
                    <span>{row.secondary}</span>
                  </th>
                  {dates.map((date) => {
                    const available = isInventoryDateAvailable(date, freshness);
                    const count = observations.get(date) ?? 0;
                    const inStock = count > 0;
                    const description = available
                      ? `${formatDate(date)}: ${inStock ? `${count} bottle${count === 1 ? "" : "s"} in stock` : "sold out"}`
                      : `${formatDate(date)}: data unavailable`;
                    return (
                      <td
                        key={date}
                        className={
                          !available
                            ? "stock-cell stock-cell--unknown"
                            : inStock
                              ? "stock-cell stock-cell--in"
                              : "stock-cell stock-cell--out"
                        }
                        title={description}
                        aria-label={description}
                      >
                        <span aria-hidden="true">{available ? (inStock ? count : "—") : "?"}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-inventory-list">
        {rows.map((row) => {
          const latestAvailable = isInventoryDateAvailable(to, freshness);
          const count = latestCount(row.inventory, to);
          const availableDays = stockDays(row.inventory);
          const observations = inventoryMap(row.inventory);
          return (
            <article className="mobile-inventory-card" key={row.id}>
              <div className="mobile-inventory-card__heading">
                <div>
                  <h3>
                    <Link to={row.href}>{row.label}</Link>
                  </h3>
                  <p>{row.secondary}</p>
                </div>
                <span
                  className={
                    !latestAvailable
                      ? "status-pill status-pill--neutral"
                      : count > 0
                        ? "status-pill status-pill--in"
                        : "status-pill status-pill--out"
                  }
                >
                  {!latestAvailable
                    ? "Data unavailable"
                    : count > 0
                      ? `${count} in stock`
                      : "Sold out"}
                </span>
              </div>
              <div className="mobile-inventory-card__meta">
                <span>
                  <strong>{availableDays}</strong> in-stock day{availableDays === 1 ? "" : "s"}
                </span>
                <span>Latest day · {formatDate(to, { day: "numeric", month: "short" })}</span>
              </div>
              <div className="stock-strip" aria-label={`Availability strip for ${row.label}`}>
                {dates.map((date) => {
                  const available = isInventoryDateAvailable(date, freshness);
                  const dailyCount = observations.get(date) ?? 0;
                  const description = available
                    ? `${formatDate(date)}: ${dailyCount > 0 ? `${dailyCount} in stock` : "sold out"}`
                    : `${formatDate(date)}: data unavailable`;
                  return (
                    <span
                      key={date}
                      className={
                        !available
                          ? "stock-strip__day is-unknown"
                          : dailyCount > 0
                            ? "stock-strip__day is-in"
                            : "stock-strip__day is-out"
                      }
                      title={description}
                      aria-label={description}
                    />
                  );
                })}
              </div>
              <Link className="text-link" to={row.href}>
                Open daily calendar <span aria-hidden="true">→</span>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
};
