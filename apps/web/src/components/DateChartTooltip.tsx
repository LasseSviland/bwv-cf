import { formatDate } from "../utils/dates";
import { cn } from "../lib/utils";

interface DateChartTooltipEntry {
  value?: unknown;
  payload?: {
    date?: unknown;
    value?: unknown;
  };
}

export interface DateChartTooltipProps {
  active?: boolean;
  color: string;
  compact?: boolean;
  label?: string | number;
  metricLabel: string;
  payload?: readonly DateChartTooltipEntry[];
  valueFormatter?: (value: number) => string;
}

const defaultValueFormatter = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 0 });

export const DateChartTooltip = ({
  active,
  color,
  compact = false,
  label,
  metricLabel,
  payload,
  valueFormatter = defaultValueFormatter,
}: DateChartTooltipProps) => {
  const entry = payload?.[0];
  const date = entry?.payload?.date ?? label;
  const value = entry?.payload?.value ?? entry?.value;

  if (!active || typeof date !== "string" || typeof value !== "number") return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/85 bg-popover/98 px-3 py-2.5 text-popover-foreground shadow-[0_16px_42px_rgb(31_45_37/16%)] backdrop-blur-sm",
        compact ? "w-36 sm:w-[11.5rem]" : "min-w-48",
      )}
      role="status"
      aria-live="polite"
    >
      <time
        dateTime={date}
        className="block text-[0.68rem] font-semibold tracking-[0.02em] text-muted-foreground"
      >
        {formatDate(date, { weekday: "long", month: "long" })}
      </time>
      <div
        className={cn(
          "mt-2 gap-x-2.5",
          compact ? "grid grid-cols-[auto_1fr] gap-y-1" : "flex items-center",
        )}
      >
        <span
          className="size-2.5 shrink-0 rounded-full ring-2 ring-card"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">{metricLabel}</span>
        <strong
          className={cn("shrink-0 text-sm font-semibold tabular-nums", compact && "col-start-2")}
        >
          {valueFormatter(value)}
        </strong>
      </div>
    </div>
  );
};
