import { Link } from "react-router-dom";
import type { DailyInventory, Freshness, ISODate } from "../api/types";
import type { AssortmentStatus } from "../utils/assortment";
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
  secondary?: string;
  assortmentStatus?: AssortmentStatus;
  assortmentNote?: string;
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
  freshness: Pick<Freshness, "coveredThrough" | "availableDates" | "missingMonths">;
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

const rowStatus = (row: InventoryRow): AssortmentStatus => row.assortmentStatus ?? "required";

const inventoryDescription = (
  row: InventoryRow,
  date: ISODate,
  available: boolean,
  count: number,
): string => {
  if (!available) return `${formatDate(date)}: data unavailable`;
  const bottles = `${count} bottle${count === 1 ? "" : "s"} in stock`;
  switch (rowStatus(row)) {
    case "additional":
      return `${formatDate(date)}: ${count > 0 ? bottles : "not currently stocked"}; additional product`;
    case "unknown":
      return `${formatDate(date)}: ${count > 0 ? bottles : "not currently stocked"}; assortment not classified`;
    default:
      return `${formatDate(date)}: ${count > 0 ? bottles : "sold out"}`;
  }
};

const assortmentBadge = (row: InventoryRow) => {
  const status = rowStatus(row);
  if (status === "required") return null;
  return (
    <div className="mt-2 space-y-1.5">
      <Badge
        className={
          status === "additional"
            ? "bg-sky-100 text-sky-900 hover:bg-sky-100"
            : "bg-amber-100 text-amber-900 hover:bg-amber-100"
        }
      >
        {status === "additional" ? "Additional product" : "Assortment unknown"}
      </Badge>
      {row.assortmentNote ? (
        <span className="block max-w-64 text-xs font-normal text-muted-foreground">
          {row.assortmentNote}
        </span>
      ) : null}
    </div>
  );
};

export const InventoryMatrix = ({
  rows,
  from,
  to,
  entityLabel,
  emptyTitle,
  emptyDescription,
  freshness,
}: InventoryMatrixProps) => {
  const dates = enumerateDates(from, to).reverse();
  const monthGroups = groupDatesByMonth(dates);
  const showAdditional = rows.some((row) => rowStatus(row) === "additional");
  const showUnknown = rows.some((row) => rowStatus(row) === "unknown");
  const showAssortmentExplanation = showAdditional || showUnknown;

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <section className="space-y-4" aria-label={`Daily availability by ${entityLabel}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Scroll horizontally to move through the period.</p>
          {showAssortmentExplanation ? (
            <p>
              Sold out is used only for the store's fixed assortment. Additional products are
              optional local stock.
            </p>
          ) : null}
        </div>
        <StockLegend showAdditional={showAdditional} showUnknown={showUnknown} />
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
                className="sticky left-0 z-30 min-w-64 border-r border-b border-border bg-card px-4"
                rowSpan={2}
                scope="col"
              >
                {entityLabel}
              </TableHead>
              {monthGroups.map((group) => (
                <TableHead
                  className="h-9 border-r border-b border-border bg-muted/60 text-center text-xs text-muted-foreground"
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
                    className="h-12 min-w-11 border-r border-b border-border bg-muted/30 p-1 text-center"
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
            {rows.map((row, rowIndex) => {
              const observations = inventoryMap(row.inventory);
              const separatorClass = rowIndex < rows.length - 1 ? " border-b border-border" : "";
              return (
                <TableRow key={row.id}>
                  <th
                    className={`sticky left-0 z-20 min-w-64 border-r bg-card px-4 py-3 text-left${separatorClass}`}
                    scope="row"
                  >
                    <Link
                      className="block max-w-56 truncate text-sm font-medium text-primary hover:underline"
                      to={row.href}
                    >
                      {row.label}
                    </Link>
                    {row.secondary ? (
                      <span className="mt-1 block max-w-56 truncate text-xs font-normal text-muted-foreground">
                        {row.secondary}
                      </span>
                    ) : null}
                    {assortmentBadge(row)}
                  </th>
                  {dates.map((date) => {
                    const available = isInventoryDateAvailable(date, freshness);
                    const count = observations.get(date) ?? 0;
                    const inStock = count > 0;
                    const status = rowStatus(row);
                    const description = inventoryDescription(row, date, available, count);
                    return (
                      <TableCell
                        key={date}
                        className={
                          !available
                            ? `h-14 min-w-11 border-r bg-muted/30 p-1 text-center text-muted-foreground${separatorClass}`
                            : status === "additional"
                              ? `h-14 min-w-11 border-r bg-sky-100 p-1 text-center font-semibold text-sky-900${separatorClass}`
                              : status === "unknown"
                                ? `h-14 min-w-11 border-r bg-amber-100 p-1 text-center text-amber-900${separatorClass}`
                                : inStock
                                  ? `h-14 min-w-11 border-r bg-emerald-100 p-1 text-center font-semibold text-emerald-900${separatorClass}`
                                  : `h-14 min-w-11 border-r bg-rose-100 p-1 text-center text-rose-900${separatorClass}`
                        }
                        title={description}
                        aria-label={description}
                      >
                        <span aria-hidden="true">
                          {!available
                            ? "?"
                            : inStock
                              ? count
                              : status === "additional"
                                ? "A"
                                : status === "unknown"
                                  ? "i"
                                  : "—"}
                        </span>
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
          const status = rowStatus(row);
          return (
            <Card key={row.id}>
              <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">
                    <Link to={row.href}>{row.label}</Link>
                  </h3>
                  {row.secondary ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{row.secondary}</p>
                  ) : null}
                </div>
                <Badge
                  variant={!latestAvailable ? "outline" : undefined}
                  className={
                    !latestAvailable
                      ? "shrink-0"
                      : status === "additional"
                        ? "shrink-0 bg-sky-100 text-sky-900 hover:bg-sky-100"
                        : status === "unknown"
                          ? "shrink-0 bg-amber-100 text-amber-900 hover:bg-amber-100"
                          : count > 0
                            ? "shrink-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                            : "shrink-0 bg-rose-100 text-rose-900 hover:bg-rose-100"
                  }
                >
                  {!latestAvailable
                    ? "Data unavailable"
                    : status === "additional"
                      ? count > 0
                        ? `Additional · ${count} in stock`
                        : "Additional product"
                      : status === "unknown"
                        ? count > 0
                          ? `Unclassified · ${count} in stock`
                          : "Assortment unknown"
                        : count > 0
                          ? `${count} in stock`
                          : "Sold out"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {status !== "required" && row.assortmentNote ? (
                  <p className="text-xs text-muted-foreground">{row.assortmentNote}</p>
                ) : null}
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
                    const description = inventoryDescription(row, date, available, dailyCount);
                    return (
                      <span
                        key={date}
                        className={
                          !available
                            ? "h-5 min-w-2 flex-1 rounded-sm border border-dashed bg-muted"
                            : status === "additional"
                              ? "h-5 min-w-2 flex-1 rounded-sm bg-sky-300"
                              : status === "unknown"
                                ? "h-5 min-w-2 flex-1 rounded-sm bg-amber-300"
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
