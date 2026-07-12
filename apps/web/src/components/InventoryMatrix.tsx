import { Link } from "react-router-dom";
import type { DailyInventory, Freshness, ISODate } from "../api/types";
import {
  enumerateDates,
  formatDate,
  formatMonth,
  groupDatesByMonth,
  inventoryMap,
  isInventoryDateAvailable,
  latestAvailableDate,
  latestCount,
  stockDays,
} from "../utils/dates";
import { EmptyState } from "./AsyncState";
import { StockLegend } from "./StockLegend";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

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
    <section className="space-y-4" aria-label={`Daily availability by ${entityLabel}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Daily availability
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Scroll horizontally to move through the period.
          </p>
        </div>
        <StockLegend />
      </div>

      <Card
        className="hidden py-0 md:block"
        tabIndex={0}
        aria-label="Scrollable daily inventory table"
      >
        <Table className="w-max min-w-full border-separate border-spacing-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className="sticky left-0 z-30 min-w-64 border-r bg-card px-4"
                rowSpan={2}
                scope="col"
              >
                {entityLabel}
              </TableHead>
              {monthGroups.map((group) => (
                <TableHead
                  className="h-9 border-r bg-muted/60 text-center text-xs text-muted-foreground"
                  key={group.month}
                  colSpan={group.dates.length}
                  scope="colgroup"
                >
                  {formatMonth(group.month)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {dates.map((date) => {
                const parts = dayParts(date);
                return (
                  <TableHead
                    className="h-12 min-w-11 border-r bg-muted/30 p-1 text-center"
                    key={date}
                    scope="col"
                    title={formatDate(date)}
                  >
                    <span className="block text-[0.62rem] text-muted-foreground uppercase">
                      {parts.weekday}
                    </span>
                    <strong className="text-xs">{parts.day}</strong>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const observations = inventoryMap(row.inventory);
              return (
                <TableRow key={row.id}>
                  <th
                    className="sticky left-0 z-20 min-w-64 border-r bg-card px-4 py-3 text-left"
                    scope="row"
                  >
                    <Link
                      className="block max-w-56 truncate text-sm font-medium text-primary hover:underline"
                      to={row.href}
                    >
                      {row.label}
                    </Link>
                    <span className="mt-1 block max-w-56 truncate text-xs font-normal text-muted-foreground">
                      {row.secondary}
                    </span>
                  </th>
                  {dates.map((date) => {
                    const available = isInventoryDateAvailable(date, freshness);
                    const count = observations.get(date) ?? 0;
                    const inStock = count > 0;
                    const description = available
                      ? `${formatDate(date)}: ${inStock ? `${count} bottle${count === 1 ? "" : "s"} in stock` : "sold out"}`
                      : `${formatDate(date)}: data unavailable`;
                    return (
                      <TableCell
                        key={date}
                        className={
                          !available
                            ? "h-14 min-w-11 border-r bg-muted/30 p-1 text-center text-muted-foreground"
                            : inStock
                              ? "h-14 min-w-11 border-r bg-emerald-100 p-1 text-center font-semibold text-emerald-900"
                              : "h-14 min-w-11 border-r bg-rose-100 p-1 text-center text-rose-900"
                        }
                        title={description}
                        aria-label={description}
                      >
                        <span aria-hidden="true">{available ? (inStock ? count : "—") : "?"}</span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const latestDate = latestAvailableDate(from, to, freshness);
          const latestAvailable = latestDate !== null;
          const count = latestDate ? latestCount(row.inventory, latestDate) : 0;
          const availableDays = stockDays(row.inventory);
          const observations = inventoryMap(row.inventory);
          return (
            <Card key={row.id}>
              <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">
                    <Link to={row.href}>{row.label}</Link>
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.secondary}</p>
                </div>
                <Badge
                  variant={!latestAvailable ? "outline" : undefined}
                  className={
                    !latestAvailable
                      ? "shrink-0"
                      : count > 0
                        ? "shrink-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                        : "shrink-0 bg-rose-100 text-rose-900 hover:bg-rose-100"
                  }
                >
                  {!latestAvailable
                    ? "Data unavailable"
                    : count > 0
                      ? `${count} in stock`
                      : "Sold out"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{availableDays}</strong> in-stock day
                    {availableDays === 1 ? "" : "s"}
                  </span>
                  <span>
                    Latest day ·{" "}
                    {latestDate
                      ? formatDate(latestDate, { day: "numeric", month: "short" })
                      : "unavailable"}
                  </span>
                </div>
                <div
                  className="flex gap-1 overflow-x-auto pb-1"
                  aria-label={`Availability strip for ${row.label}`}
                >
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
                            ? "h-5 min-w-2 flex-1 rounded-sm border border-dashed bg-muted"
                            : dailyCount > 0
                              ? "h-5 min-w-2 flex-1 rounded-sm bg-emerald-400"
                              : "h-5 min-w-2 flex-1 rounded-sm bg-rose-300"
                        }
                        title={description}
                        aria-label={description}
                      />
                    );
                  })}
                </div>
                <Button asChild variant="link" className="h-auto justify-start p-0">
                  <Link to={row.href}>
                    Open {entityLabel.toLocaleLowerCase()} <span aria-hidden="true">→</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
