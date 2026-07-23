import { memo, useId } from "react";
import type { DailyInventory } from "../api/types";
import { formatDate } from "../utils/dates";

interface BottleHistoryProps {
  inventory: DailyInventory[];
  label: string;
}

const number = (value: number) => value.toLocaleString("en-GB");

export const BottleHistory = memo(function BottleHistory({ inventory, label }: BottleHistoryProps) {
  const gradientId = useId().replace(/:/g, "");
  const descriptionId = `${gradientId}-description`;
  const current = inventory.at(-1);
  const first = inventory[0];
  const series = inventory.slice(-18);
  const newestFirst = [...inventory].reverse();
  const inventoryDescription = newestFirst
    .map(({ date, count }) => `${formatDate(date)}: ${count} bottle${count === 1 ? "" : "s"}`)
    .join("; ");
  const counts = series.map(({ count }) => count);
  const minimum = Math.min(...counts, 0);
  const maximum = Math.max(...counts, 1);
  const range = Math.max(maximum - minimum, 1);
  const points = series.map(({ count }, index) => ({
    x: series.length === 1 ? 320 : (index / Math.max(series.length - 1, 1)) * 320,
    y: 62 - ((count - minimum) / range) * 50,
  }));
  const line = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = points.length
    ? `M ${points.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} L 320 70 L 0 70 Z`
    : "";
  const change = current && first ? current.count - first.count : 0;

  return (
    <div className="relative min-w-0">
      <div
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:gap-5"
        aria-label={`Daily bottle count for ${label}`}
        aria-describedby={inventoryDescription ? descriptionId : undefined}
        role="img"
      >
        <div className="min-w-[5.5rem]">
          <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Latest stock
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
          <svg
            className="h-16 w-full overflow-visible"
            viewBox="0 0 320 70"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2c7452" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#2c7452" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke="#2c7452"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.length ? (
              <circle
                cx={points.at(-1)?.x}
                cy={points.at(-1)?.y}
                r="3.5"
                fill="#fffefa"
                stroke="#2c7452"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          <div className="mt-0.5 flex items-center justify-between text-[0.6rem] text-muted-foreground/80">
            <span>
              {series[0] ? formatDate(series[0].date, { day: "numeric", month: "short" }) : ""}
            </span>
            <span>
              {current ? formatDate(current.date, { day: "numeric", month: "short" }) : ""}
            </span>
          </div>
        </div>
      </div>
      {inventoryDescription ? (
        <span className="sr-only" id={descriptionId}>
          {inventoryDescription}
        </span>
      ) : null}
    </div>
  );
});
