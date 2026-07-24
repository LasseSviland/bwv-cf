import { useCallback, useEffect, useId, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../lib/utils";
import { formatDate } from "../utils/dates";
import { DateChartTooltip } from "./DateChartTooltip";

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface TimeSeriesChartProps {
  ariaLabel: string;
  className?: string;
  color: string;
  data: readonly TimeSeriesPoint[];
  description: string;
  height: number;
  metricLabel: string;
  mode: "area" | "bars";
  showAxes?: boolean;
  valueFormatter?: (value: number) => string;
}

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 0 });

const coarsePointerQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? (window.matchMedia("(hover: none), (pointer: coarse)") ?? null)
    : null;

const useTooltipTrigger = (): "click" | "hover" => {
  const [coarsePointer, setCoarsePointer] = useState(() => coarsePointerQuery()?.matches ?? false);

  useEffect(() => {
    const query = coarsePointerQuery();
    if (query === null) return;
    const update = () => setCoarsePointer(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarsePointer ? "click" : "hover";
};

let activeTooltipOwner: string | null = null;
let dismissActiveTooltip: (() => void) | null = null;
let tooltipDismissListenersRegistered = false;

const registerTooltipDismissListeners = () => {
  if (tooltipDismissListenersRegistered || typeof window === "undefined") return;
  window.addEventListener("scroll", () => dismissActiveTooltip?.(), true);
  window.addEventListener("resize", () => dismissActiveTooltip?.());
  tooltipDismissListenersRegistered = true;
};

export const TimeSeriesChart = ({
  ariaLabel,
  className,
  color,
  data,
  description,
  height,
  metricLabel,
  mode,
  showAxes = true,
  valueFormatter,
}: TimeSeriesChartProps) => {
  const chartId = `time-series-${useId().replaceAll(":", "")}`;
  const descriptionId = `${chartId}-description`;
  const tooltipTrigger = useTooltipTrigger();
  const [tooltipEnabled, setTooltipEnabled] = useState(false);
  const chartData = data.map(({ date, value }) => ({ date, value }));
  const gradientId = `${chartId}-gradient`;
  const margin = showAxes
    ? { top: 12, right: 10, bottom: 2, left: 0 }
    : { top: 3, right: 2, bottom: 3, left: 2 };

  const dismissTooltip = useCallback(() => {
    setTooltipEnabled(false);
    if (activeTooltipOwner === chartId) {
      activeTooltipOwner = null;
      dismissActiveTooltip = null;
    }
  }, [chartId]);

  const activateTooltip = useCallback(() => {
    registerTooltipDismissListeners();
    if (activeTooltipOwner !== chartId) dismissActiveTooltip?.();
    activeTooltipOwner = chartId;
    dismissActiveTooltip = dismissTooltip;
    setTooltipEnabled(true);
  }, [chartId, dismissTooltip]);

  useEffect(
    () => () => {
      if (activeTooltipOwner === chartId) {
        activeTooltipOwner = null;
        dismissActiveTooltip = null;
      }
    },
    [chartId],
  );

  if (chartData.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-border/55 bg-background/35 text-xs text-muted-foreground",
          className,
        )}
        style={{ height }}
        data-chart-library="recharts"
        data-chart-points="0"
        role="application"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={descriptionId}
      >
        No covered dates
        <span className="sr-only" id={descriptionId}>
          {description}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative min-w-0", className)}
      style={{ height }}
      data-chart-library="recharts"
      data-chart-points={chartData.length}
      onBlur={dismissTooltip}
      onFocus={activateTooltip}
      onPointerDown={activateTooltip}
      onPointerEnter={activateTooltip}
      onPointerLeave={tooltipTrigger === "hover" ? dismissTooltip : undefined}
      onPointerMove={activateTooltip}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: showAxes ? 720 : 320, height }}
      >
        <ComposedChart
          data={chartData}
          margin={margin}
          accessibilityLayer
          role="application"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={showAxes ? 0.24 : 0.2} />
              <stop offset="100%" stopColor={color} stopOpacity="0.015" />
            </linearGradient>
          </defs>

          {showAxes ? (
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
          ) : null}
          <XAxis
            dataKey="date"
            hide={!showAxes}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            minTickGap={28}
            interval="preserveStartEnd"
            padding={{ left: 4, right: 4 }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(date: string) =>
              formatDate(date, { day: "numeric", month: "short", year: false })
            }
          />
          <YAxis
            hide={!showAxes}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            allowDecimals={false}
            domain={[0, (maximum: number) => Math.max(1, maximum)]}
            width={40}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={number}
          />
          <Tooltip
            active={tooltipEnabled ? undefined : false}
            shared={mode === "bars" ? true : undefined}
            trigger={tooltipTrigger}
            cursor={
              mode === "bars"
                ? { fill: "var(--secondary)", fillOpacity: 0.72 }
                : {
                    stroke: "var(--muted-foreground)",
                    strokeDasharray: "3 4",
                    strokeOpacity: 0.5,
                    strokeWidth: 1,
                  }
            }
            isAnimationActive={false}
            allowEscapeViewBox={{ x: false, y: true }}
            offset={showAxes ? 10 : 6}
            wrapperStyle={{ outline: "none", zIndex: 40 }}
            content={(props) => (
              <DateChartTooltip
                active={props.active}
                color={color}
                compact={!showAxes}
                label={props.label}
                metricLabel={metricLabel}
                payload={props.payload}
                valueFormatter={valueFormatter}
              />
            )}
          />

          {mode === "area" ? (
            <Area
              type="monotone"
              dataKey="value"
              name={metricLabel}
              stroke={color}
              strokeWidth={showAxes ? 2.75 : 2.25}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              dot={showAxes && chartData.length <= 31 ? { r: 2, fill: "var(--card)" } : false}
              activeDot={{
                r: showAxes ? 5 : 4,
                fill: "var(--card)",
                stroke: color,
                strokeWidth: 2.5,
              }}
              isAnimationActive={false}
            />
          ) : (
            <Bar
              dataKey="value"
              name={metricLabel}
              fill={color}
              fillOpacity={0.82}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              activeBar={{ fill: color, fillOpacity: 1, stroke: "var(--card)", strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <span className="sr-only" id={descriptionId}>
        {description}
      </span>
    </div>
  );
};
