import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DailyStockoutStatistics,
  StatisticsResponse,
  StockoutWineStatistics,
} from "../api/types";
import { cn } from "../lib/utils";
import { formatDate } from "../utils/dates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface StockoutStatisticsProps {
  statistics: StatisticsResponse;
}

type DailyValue = (entry: DailyStockoutStatistics) => number;

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

const useCompactChart = () => {
  const [compact, setCompact] = useState(() => compactChartQuery()?.matches ?? false);
  useEffect(() => {
    const query = compactChartQuery();
    if (query === null) return;
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
};

const DailyChart = ({
  daily,
  value,
  label,
  color,
  mode,
  wide = false,
}: {
  daily: DailyStockoutStatistics[];
  value: DailyValue;
  label: string;
  color: string;
  mode: "line" | "bars";
  wide?: boolean;
}) => {
  const chartId = `daily-chart-${useId().replaceAll(":", "")}`;
  const compact = useCompactChart();
  const width = compact ? 360 : wide ? 920 : 560;
  const height = compact ? 210 : wide ? 270 : 230;
  const padding = compact
    ? { top: 18, right: 12, bottom: 34, left: 38 }
    : { top: 20, right: 18, bottom: 38, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = daily.map(value);
  const actualMaximum = Math.max(0, ...values);
  const maximum = Math.max(1, actualMaximum);
  const points = daily.map((entry, index) => ({
    x:
      daily.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (daily.length - 1)) * plotWidth,
    y: padding.top + plotHeight - (value(entry) / maximum) * plotHeight,
    entry,
    value: value(entry),
  }));
  const yTicks = [0, Math.round(maximum / 2), maximum].filter(
    (tick, index, all) => all.indexOf(tick) === index,
  );
  const barStep = daily.length === 0 ? plotWidth : plotWidth / daily.length;
  const barWidth = Math.max(1, Math.min(18, barStep * 0.68));

  return (
    <svg
      className="block h-auto w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${chartId}-title ${chartId}-description`}
    >
      <title id={`${chartId}-title`}>{label} by day</title>
      <desc id={`${chartId}-description`}>
        {daily.length === 0
          ? "No covered dates."
          : `${daily.length} covered days. ${label} ranged from ${number(Math.min(...values))} to ${number(actualMaximum)}.`}
      </desc>
      {mode === "line" ? (
        <defs>
          <linearGradient id={`${chartId}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
      ) : null}
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
            />
            <text
              x={padding.left - 9}
              y={y + 4}
              fill="var(--muted-foreground)"
              fontSize={compact ? 10 : 11}
              textAnchor="end"
            >
              {number(tick)}
            </text>
          </g>
        );
      })}
      {mode === "line" && points.length > 0 ? (
        <>
          <path d={areaPath(points, padding.top + plotHeight)} fill={`url(#${chartId}-fill)`} />
          <path
            d={linePath(points)}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {daily.length <= 45
            ? points.map((point) => (
                <circle
                  key={point.entry.date}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="var(--background)"
                  stroke={color}
                  strokeWidth="2"
                >
                  <title>{`${formatDate(point.entry.date)}: ${number(point.value)}`}</title>
                </circle>
              ))
            : null}
        </>
      ) : null}
      {mode === "bars"
        ? points.map((point, index) => {
            const heightValue = (point.value / maximum) * plotHeight;
            const x = padding.left + index * barStep + (barStep - barWidth) / 2;
            return (
              <rect
                key={point.entry.date}
                x={x}
                y={padding.top + plotHeight - heightValue}
                width={barWidth}
                height={Math.max(point.value > 0 ? 2 : 0, heightValue)}
                rx={Math.min(3, barWidth / 3)}
                fill={color}
                opacity="0.86"
              >
                <title>{`${formatDate(point.entry.date)}: ${number(point.value)}`}</title>
              </rect>
            );
          })
        : null}
      {tickIndexes(daily.length).map((index) => {
        const point = points[index];
        return point ? (
          <text
            key={point.entry.date}
            x={point.x}
            y={height - 10}
            fill="var(--muted-foreground)"
            fontSize={compact ? 10 : 11}
            textAnchor={index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}
          >
            {formatDate(point.entry.date, { day: "numeric", month: "short", year: false })}
          </text>
        ) : null;
      })}
    </svg>
  );
};

const Metric = ({ value, label }: { value: string; label: string }) => (
  <div className="min-w-0 bg-background px-4 py-5 sm:px-5 sm:py-6">
    <strong className="block text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
      {value}
    </strong>
    <span className="mt-1 block text-xs leading-5 text-muted-foreground sm:text-sm">{label}</span>
  </div>
);

const ChartSection = ({
  title,
  daily,
  value,
  color,
  mode,
  wide,
}: {
  title: string;
  daily: DailyStockoutStatistics[];
  value: DailyValue;
  color: string;
  mode: "line" | "bars";
  wide?: boolean;
}) => {
  const values = daily.map(value);
  const latest = values.at(-1) ?? 0;
  const peak = Math.max(0, ...values);
  return (
    <section className="min-w-0 border-t border-border pt-5 sm:pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="shrink-0 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">{number(latest)}</strong> latest ·{" "}
          {number(peak)} peak
        </p>
      </div>
      <div className="mt-3">
        <DailyChart
          daily={daily}
          value={value}
          label={title}
          color={color}
          mode={mode}
          wide={wide}
        />
      </div>
    </section>
  );
};

const SoldOutWine = ({
  statistics,
  maximumStoreDays,
  period,
}: {
  statistics: StockoutWineStatistics;
  maximumStoreDays: number;
  period: StatisticsResponse["period"];
}) => {
  const barWidth =
    maximumStoreDays === 0 ? 0 : (statistics.storeDaysSoldOut / maximumStoreDays) * 100;
  return (
    <article className="py-5 first:pt-0 last:pb-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <Link
            to={`/wines/${statistics.wine.id}?from=${period.from}&to=${period.to}`}
            className="inline-flex max-w-full items-center gap-1.5 font-semibold text-foreground hover:text-primary"
          >
            <span className="truncate">{statistics.wine.name}</span>
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-chart-3"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-5 text-right text-xs sm:gap-x-8">
          <div>
            <dt className="text-muted-foreground">Latest</dt>
            <dd className="mt-0.5 font-semibold">
              {number(statistics.currentStoresSoldOut)} / {number(statistics.fixedStores)} stores
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Days</dt>
            <dd className="mt-0.5 font-semibold">{number(statistics.soldOutDays)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Availability</dt>
            <dd className="mt-0.5 font-semibold">{percentage(statistics.availabilityRate)}</dd>
          </div>
        </dl>
      </div>
      <details className="group mt-3 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          {number(statistics.storeDaysSoldOut)} sold-out store-day
          {statistics.storeDaysSoldOut === 1 ? "" : "s"} · {number(statistics.soldOutDays)} date
          {statistics.soldOutDays === 1 ? "" : "s"}
        </summary>
        <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statistics.soldOutDates.map((entry) => (
            <div
              key={entry.date}
              className="flex items-center justify-between gap-3 bg-card px-3 py-2"
            >
              <time dateTime={entry.date} className="text-xs font-medium">
                {formatDate(entry.date)}
              </time>
              <span className="text-xs text-muted-foreground">
                {number(entry.storesSoldOut)} store{entry.storesSoldOut === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
};

export const StockoutStatistics = ({ statistics }: StockoutStatisticsProps) => {
  const { daily, summary, wines } = statistics;
  const latest = daily.at(-1);
  const latestAvailability =
    latest === undefined || latest.trackedPairs === 0
      ? 0
      : latest.inStockPairs / latest.trackedPairs;
  const maximumStoreDays = Math.max(0, ...wines.map(({ storeDaysSoldOut }) => storeDaysSoldOut));

  return (
    <div className="space-y-8 sm:space-y-10">
      <section aria-label="Latest fixed-assortment availability">
        <p className="mb-3 text-sm text-muted-foreground">
          {latest ? formatDate(latest.date) : "No covered date"} · {number(summary.observedDays)}{" "}
          covered day{summary.observedDays === 1 ? "" : "s"}
        </p>
        <div className="grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric value={number(latest?.soldOutPairs ?? 0)} label="fixed placements sold out" />
          <Metric value={number(latest?.distinctWinesSoldOut ?? 0)} label="wines affected" />
          <Metric value={number(latest?.distinctStoresAffected ?? 0)} label="stores affected" />
          <Metric value={percentage(latestAvailability)} label="fixed-placement availability" />
        </div>
        <dl className="grid gap-x-6 gap-y-3 border-b border-border py-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            [number(summary.distinctPairsSoldOut), "distinct placements affected"],
            [number(summary.stockoutPairDays), "sold-out placement-days"],
            [number(summary.newlySoldOutPairs), "new stockouts"],
            [
              `${number(summary.daysWithStockouts)} / ${number(summary.observedDays)}`,
              "days with stockouts",
            ],
          ].map(([value, label]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-3 sm:flex-col-reverse sm:items-start sm:gap-0"
            >
              <dt className="text-muted-foreground sm:mt-1 sm:after:hidden">{label}</dt>
              <dd className="font-semibold sm:text-base">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ChartSection
        title="Sold-out fixed placements"
        daily={daily}
        value={({ soldOutPairs }) => soldOutPairs}
        color="var(--chart-3)"
        mode="line"
        wide
      />

      <div className="grid min-w-0 gap-7 lg:grid-cols-3">
        <ChartSection
          title="Wines affected"
          daily={daily}
          value={({ distinctWinesSoldOut }) => distinctWinesSoldOut}
          color="var(--chart-4)"
          mode="bars"
        />
        <ChartSection
          title="Stores affected"
          daily={daily}
          value={({ distinctStoresAffected }) => distinctStoresAffected}
          color="var(--chart-3)"
          mode="bars"
        />
        <ChartSection
          title="New stockouts"
          daily={daily}
          value={({ newlySoldOutPairs }) => newlySoldOutPairs}
          color="var(--chart-2)"
          mode="bars"
        />
      </div>

      <section className="border-t border-border pt-5 sm:pt-6" aria-labelledby="sold-out-wines">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="sold-out-wines" className="text-lg font-semibold tracking-[-0.02em]">
            Sold-out wines
          </h2>
          <p className="text-xs text-muted-foreground">
            {number(wines.length)} affected in this period
          </p>
        </div>
        {wines.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No fixed-assortment stockouts.</p>
        ) : (
          <div className="mt-5 divide-y divide-border">
            {wines.map((wine) => (
              <SoldOutWine
                key={wine.wine.id}
                statistics={wine}
                maximumStoreDays={maximumStoreDays}
                period={statistics.period}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border pt-5 sm:pt-6" aria-labelledby="daily-numbers">
        <h2 id="daily-numbers" className="text-lg font-semibold tracking-[-0.02em]">
          Daily numbers
        </h2>
        <div className="mt-4 overflow-x-auto border-y border-border">
          <Table className="min-w-180">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3 sm:pl-4">Date</TableHead>
                <TableHead className="text-right">Sold out</TableHead>
                <TableHead className="text-right">Availability</TableHead>
                <TableHead className="text-right">Wines</TableHead>
                <TableHead className="text-right">Stores</TableHead>
                <TableHead className="pr-3 text-right sm:pr-4">New stockouts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...daily].reverse().map((entry, index) => (
                <TableRow key={entry.date} className={cn(index === 0 && "bg-secondary/45")}>
                  <TableCell className="pl-3 font-medium whitespace-nowrap sm:pl-4">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {number(entry.soldOutPairs)}
                  </TableCell>
                  <TableCell className="text-right">
                    {percentage(
                      entry.trackedPairs === 0 ? 0 : entry.inStockPairs / entry.trackedPairs,
                    )}
                  </TableCell>
                  <TableCell className="text-right">{number(entry.distinctWinesSoldOut)}</TableCell>
                  <TableCell className="text-right">
                    {number(entry.distinctStoresAffected)}
                  </TableCell>
                  <TableCell className="pr-3 text-right sm:pr-4">
                    {number(entry.newlySoldOutPairs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Fixed-assortment placements only. Optional local stock is excluded from sold-out counts.
      </p>
    </div>
  );
};
