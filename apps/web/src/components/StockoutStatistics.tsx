import { Activity, CalendarOff, MapPin, MoveRight, PackageMinus, Store, Wine } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { DailyStockoutStatistics, StatisticsResponse } from "../api/types";
import { cn } from "../lib/utils";
import { formatDate } from "../utils/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface StockoutStatisticsProps {
  statistics: StatisticsResponse;
}

const number = (value: number, maximumFractionDigits = 0): string =>
  value.toLocaleString("en-GB", { maximumFractionDigits });

const percentage = (value: number): string =>
  value.toLocaleString("en-GB", { style: "percent", maximumFractionDigits: 1 });

const linePath = (points: readonly { x: number; y: number }[]): string =>
  points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

const areaPath = (points: readonly { x: number; y: number }[], baseline: number): string => {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points.at(-1)!;
  return `${linePath(points)} L${last.x},${baseline} L${first.x},${baseline} Z`;
};

const tickIndexes = (length: number): number[] => {
  if (length <= 1) return length === 0 ? [] : [0];
  return [...new Set([0, Math.round((length - 1) / 2), length - 1])];
};

const compactChartQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? (window.matchMedia("(max-width: 639px)") ?? null)
    : null;

const StockoutTrendChart = ({ daily }: { daily: DailyStockoutStatistics[] }) => {
  const gradientId = `stockout-fill-${useId().replaceAll(":", "")}`;
  const [compact, setCompact] = useState(() => compactChartQuery()?.matches ?? false);
  useEffect(() => {
    const query = compactChartQuery();
    if (query === null) return;
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const width = compact ? 360 : 920;
  const height = compact ? 220 : 280;
  const padding = compact
    ? { top: 24, right: 12, bottom: 34, left: 40 }
    : { top: 26, right: 24, bottom: 40, left: 58 };
  const chartFontSize = compact ? 11 : 12;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...daily.map(({ soldOutPairs }) => soldOutPairs));
  const points = daily.map((entry, index) => ({
    x:
      daily.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (daily.length - 1)) * plotWidth,
    y: padding.top + plotHeight - (entry.soldOutPairs / maximum) * plotHeight,
    entry,
  }));
  const yTicks = [0, Math.round(maximum / 2), maximum].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
  const peak = points.reduce<(typeof points)[number] | null>(
    (current, point) =>
      current === null || point.entry.soldOutPairs > current.entry.soldOutPairs ? point : current,
    null,
  );

  return (
    <svg
      className="block h-auto w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${gradientId}-title ${gradientId}-description`}
    >
      <title id={`${gradientId}-title`}>Daily wine-store stockouts</title>
      <desc id={`${gradientId}-description`}>
        {daily.length === 0
          ? "No covered inventory dates in the selected period."
          : `${daily.length} covered days. Stockouts range from ${Math.min(
              ...daily.map(({ soldOutPairs }) => soldOutPairs),
            )} to ${maximum} wine-store pairs per day.`}
      </desc>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-3)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--chart-3)" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => {
        const y = padding.top + plotHeight - (tick / maximum) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 12}
              y={y + 4}
              fill="var(--muted-foreground)"
              fontSize={chartFontSize}
              textAnchor="end"
            >
              {number(tick)}
            </text>
          </g>
        );
      })}
      {points.length > 0 ? (
        <>
          <path d={areaPath(points, padding.top + plotHeight)} fill={`url(#${gradientId})`} />
          <path
            d={linePath(points)}
            fill="none"
            stroke="var(--chart-3)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </>
      ) : null}
      {daily.length <= 45
        ? points.map(({ x, y, entry }) => (
            <circle
              key={entry.date}
              cx={x}
              cy={y}
              r="3"
              fill="var(--card)"
              stroke="var(--chart-3)"
              strokeWidth="2"
            />
          ))
        : null}
      {peak && peak.entry.soldOutPairs > 0 ? (
        <g>
          <circle
            cx={peak.x}
            cy={peak.y}
            r="5"
            fill="var(--chart-3)"
            stroke="var(--card)"
            strokeWidth="3"
          />
          <text
            x={Math.min(
              Math.max(peak.x, padding.left + (compact ? 34 : 50)),
              width - padding.right - (compact ? 34 : 50),
            )}
            y={Math.max(peak.y - 13, 15)}
            fill="var(--foreground)"
            fontSize={chartFontSize}
            fontWeight="600"
            textAnchor="middle"
          >
            Peak {number(peak.entry.soldOutPairs)}
          </text>
        </g>
      ) : null}
      {tickIndexes(daily.length).map((index) => {
        const point = points[index];
        return point ? (
          <text
            key={point.entry.date}
            x={point.x}
            y={height - 12}
            fill="var(--muted-foreground)"
            fontSize={chartFontSize}
            textAnchor={index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}
          >
            {formatDate(point.entry.date, { day: "numeric", month: "short", year: false })}
          </text>
        ) : null;
      })}
    </svg>
  );
};

const PrimaryMetric = ({
  icon: Icon,
  value,
  label,
  detail,
  featured = false,
}: {
  icon: typeof Wine;
  value: string;
  label: string;
  detail: string;
  featured?: boolean;
}) => (
  <Card
    className={cn(
      "rounded-3xl border-0 py-0 shadow-[0_22px_60px_rgb(31_45_37/7%)] ring-1 ring-foreground/8",
      featured &&
        "bg-primary text-primary-foreground shadow-[0_28px_75px_rgb(31_45_37/20%)] ring-0",
    )}
  >
    <CardHeader className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
      <span
        className={cn(
          "mb-5 grid size-10 place-items-center rounded-2xl bg-secondary text-primary",
          featured && "bg-white/10 text-primary-foreground ring-1 ring-white/10",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <CardTitle className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
        {value}
      </CardTitle>
      <CardDescription
        className={cn("mt-1 font-medium text-foreground", featured && "text-primary-foreground")}
      >
        {label}
      </CardDescription>
      <p
        className={cn(
          "pt-1 text-xs leading-relaxed text-muted-foreground",
          featured && "text-primary-foreground/65",
        )}
      >
        {detail}
      </p>
    </CardHeader>
  </Card>
);

export const StockoutStatistics = ({ statistics }: StockoutStatisticsProps) => {
  const { daily, summary } = statistics;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Selected period
          </p>
          <p className="mt-1 font-serif text-xl tracking-[-0.02em] text-foreground">
            Portfolio inventory health
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(statistics.period.from)} – {formatDate(statistics.period.to)} ·{" "}
          {number(summary.observedDays)} covered days
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Selected period stockout summary">
        <PrimaryMetric
          icon={PackageMinus}
          value={number(summary.distinctPairsSoldOut)}
          label="wine-store stockouts"
          detail="Distinct placements that reached zero. One wine at five stores counts as five."
          featured
        />
        <PrimaryMetric
          icon={Wine}
          value={number(summary.distinctWinesSoldOut)}
          label="distinct wines affected"
          detail={`${number(summary.distinctStoresAffected)} stores had at least one tracked wine out of stock.`}
        />
        <PrimaryMetric
          icon={CalendarOff}
          value={`${number(summary.daysWithStockouts)} / ${number(summary.observedDays)}`}
          label="days with stockouts"
          detail={`${number(summary.stockoutPairDays)} total wine-store stockout days in the period.`}
        />
      </section>

      <section className="grid gap-px overflow-hidden rounded-3xl bg-border/70 ring-1 ring-border/70 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Activity,
            label: "New stockouts",
            value: number(summary.newlySoldOutPairs),
            detail: "transitions from positive stock to zero",
          },
          {
            icon: PackageMinus,
            label: "Bottles depleted",
            value: number(summary.bottlesLostToStockouts),
            detail: "last observed bottles before those transitions",
          },
          {
            icon: MapPin,
            label: "Average per day",
            value: number(summary.averageDailyStockouts, 1),
            detail: "wine-store pairs at zero stock",
          },
          {
            icon: Store,
            label: "Placement availability",
            value: percentage(summary.availabilityRate),
            detail: `across ${number(summary.trackedPairs)} tracked placements`,
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <div key={label} className="bg-card px-5 py-5 sm:px-6">
            <div className="mb-4 flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-[0.68rem] font-semibold tracking-[0.11em] uppercase">
                {label}
              </span>
            </div>
            <strong className="block text-2xl font-semibold tracking-[-0.03em]">{value}</strong>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {detail}
            </span>
          </div>
        ))}
      </section>

      <Card className="rounded-3xl border-0 py-0 shadow-[0_22px_70px_rgb(31_45_37/6%)] ring-1 ring-foreground/8">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:py-6">
          <div>
            <CardTitle className="font-serif text-2xl font-normal tracking-[-0.025em] sm:text-3xl">
              Daily stockout pressure
            </CardTitle>
            <CardDescription className="mt-1">
              Number of tracked wine-store placements with zero bottles on each covered date.
            </CardDescription>
          </div>
          {summary.peak ? (
            <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3 ring-1 ring-primary/8">
              <span className="size-2 rounded-full bg-chart-3" aria-hidden="true" />
              <div>
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Peak day
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {formatDate(summary.peak.date, { day: "numeric", month: "short", year: false })}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {number(summary.peak.soldOutPairs)} placements
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="px-3 py-5 sm:px-6 sm:py-6">
          <StockoutTrendChart daily={daily} />
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-0 py-0 shadow-[0_18px_50px_rgb(31_45_37/5%)] ring-1 ring-foreground/8">
        <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-7 sm:py-6">
          <CardTitle className="font-serif text-2xl font-normal tracking-[-0.025em] sm:text-3xl">
            Daily detail
          </CardTitle>
          <CardDescription>
            Exact daily totals for stockout placements, affected wines and stores, and newly
            depleted stock.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground sm:hidden">
            <span>Swipe to see every daily measure</span>
            <MoveRight className="size-4" aria-hidden="true" />
          </div>
          <Table className="min-w-225">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 bg-card pl-5 shadow-[10px_0_18px_-18px_rgb(31_45_37/55%)] sm:static sm:pl-7 sm:shadow-none">
                  Date
                </TableHead>
                <TableHead className="text-right">Out of stock</TableHead>
                <TableHead className="text-right">Wines</TableHead>
                <TableHead className="text-right">Stores</TableHead>
                <TableHead className="text-right">New stockouts</TableHead>
                <TableHead className="text-right">Bottles depleted</TableHead>
                <TableHead className="pr-5 text-right sm:pr-7">Bottles in stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daily.map((entry) => {
                const isPeak = entry.date === summary.peak?.date;
                return (
                  <TableRow
                    key={entry.date}
                    className={cn(isPeak && "bg-secondary/55 hover:bg-secondary/70")}
                  >
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 bg-card pl-5 font-medium whitespace-nowrap shadow-[10px_0_18px_-18px_rgb(31_45_37/55%)] sm:static sm:pl-7 sm:shadow-none",
                        isPeak && "bg-secondary",
                      )}
                    >
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {number(entry.soldOutPairs)}
                    </TableCell>
                    <TableCell className="text-right">
                      {number(entry.distinctWinesSoldOut)}
                    </TableCell>
                    <TableCell className="text-right">
                      {number(entry.distinctStoresAffected)}
                    </TableCell>
                    <TableCell className="text-right">{number(entry.newlySoldOutPairs)}</TableCell>
                    <TableCell className="text-right">
                      {number(entry.bottlesLostToStockouts)}
                    </TableCell>
                    <TableCell className="pr-5 text-right sm:pr-7">
                      {number(entry.totalBottles)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-border/70 bg-card/65 px-4 py-4 text-xs leading-relaxed text-muted-foreground sm:px-5">
        <strong className="font-semibold text-foreground">How this is counted.</strong> A tracked
        placement is a fixed-assortment wine-store pair, or a pair observed with stock during this
        period or its comparison reading. Missing rows in a covered daily snapshot mean zero
        bottles. “Bottles depleted” reflects stock movement into zero and is not a confirmed sales
        measure.
      </div>
    </div>
  );
};
