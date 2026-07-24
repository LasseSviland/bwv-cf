import { memo } from "react";
import type { DailyInventory } from "../api/types";
import { formatDate } from "../utils/dates";
import { TimeSeriesChart } from "./TimeSeriesChart";

interface MonopolyStockHistoryProps {
  stockByDate: DailyInventory[];
  label: string;
}

const number = (value: number) => value.toLocaleString("en-GB");

const monopolyCount = (count: number) => `${count} ${count === 1 ? "monopoly" : "monopolies"}`;

export const MonopolyStockHistory = memo(function MonopolyStockHistory({
  stockByDate,
  label,
}: MonopolyStockHistoryProps) {
  const current = stockByDate.at(-1);
  const first = stockByDate[0];
  const newestFirst = [...stockByDate].reverse();
  const stockDescription = newestFirst
    .map(({ date, count }) => `${formatDate(date)}: ${monopolyCount(count)}`)
    .join("; ");
  const change = current && first ? current.count - first.count : 0;
  const chartData = stockByDate.map(({ date, count }) => ({ date, value: count }));

  return (
    <div className="relative min-w-0">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
        <div className="min-w-[7rem]">
          <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Monopolies with stock
          </p>
          <p className="mt-1 text-2xl leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums">
            {current ? number(current.count) : "—"}
          </p>
          <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
            {current ? formatDate(current.date, { day: "numeric", month: "short" }) : "No data"}
            {change !== 0 ? (
              <span className={change > 0 ? "ml-1.5 text-emerald-700" : "ml-1.5 text-rose-700"}>
                {change > 0 ? "+" : ""}
                {number(change)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="min-w-0">
          <TimeSeriesChart
            ariaLabel={`Daily number of monopolies stocking ${label}`}
            color="var(--chart-2)"
            data={chartData}
            description={stockDescription || "No covered dates."}
            height={70}
            metricLabel="Monopolies with stock"
            mode="area"
            showAxes={false}
            valueFormatter={monopolyCount}
          />
          <div className="mt-0.5 flex items-center justify-between text-[0.6rem] text-muted-foreground/80">
            <span>{first ? formatDate(first.date, { day: "numeric", month: "short" }) : ""}</span>
            <span>
              {current ? formatDate(current.date, { day: "numeric", month: "short" }) : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
