import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  DailyStockoutStatistics,
  StatisticsResponse,
  StockoutWineStatistics,
} from "../api/types";
import { cn } from "../lib/utils";
import { formatDate } from "../utils/dates";
import { PagePanel } from "./PagePanel";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface StockoutStatisticsProps {
  statistics: StatisticsResponse;
}

type DailyValue = (entry: DailyStockoutStatistics) => number;

const number = (value: number, maximumFractionDigits = 0): string =>
  value.toLocaleString("en-GB", { maximumFractionDigits });

const percentage = (value: number): string =>
  value.toLocaleString("en-GB", { style: "percent", maximumFractionDigits: 1 });

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
  const values = daily.map(value);
  const chartData = daily.map((entry) => ({ date: entry.date, value: value(entry) }));
  const actualMaximum = Math.max(0, ...values);
  const height = wide ? 270 : 230;
  const description =
    daily.length === 0
      ? "No covered dates."
      : `${daily.length} covered days. ${label} ranged from ${number(Math.min(...values))} to ${number(actualMaximum)}.`;

  return (
    <TimeSeriesChart
      ariaLabel={`${label} by day`}
      className="rounded-lg border border-border/55 bg-background/35 px-1 pt-1"
      color={color}
      data={chartData}
      description={description}
      height={height}
      metricLabel={label}
      mode={mode === "line" ? "area" : "bars"}
      valueFormatter={number}
    />
  );
};

const Metric = ({ value, label }: { value: string; label: string }) => (
  <div className="min-w-0 bg-card px-4 py-5 sm:px-5 sm:py-6">
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
    <PagePanel data-surface="content" className="space-y-8 p-4 sm:space-y-10 sm:p-6 lg:p-7">
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
          color="var(--chart-2)"
          mode="bars"
        />
        <ChartSection
          title="New stockouts"
          daily={daily}
          value={({ newlySoldOutPairs }) => newlySoldOutPairs}
          color="var(--chart-3)"
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
        <Table className="min-w-180" containerClassName="mt-4 border-y border-border">
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
                <TableCell className="text-right">{number(entry.distinctStoresAffected)}</TableCell>
                <TableCell className="pr-3 text-right sm:pr-4">
                  {number(entry.newlySoldOutPairs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Fixed-assortment placements only. Optional local stock is excluded from sold-out counts.
      </p>
    </PagePanel>
  );
};
