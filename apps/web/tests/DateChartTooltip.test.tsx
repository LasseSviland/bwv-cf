import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateChartTooltip } from "../src/components/DateChartTooltip";

describe("DateChartTooltip", () => {
  it("shows a full date, exact metric label, and zero value", () => {
    render(
      <DateChartTooltip
        active
        color="var(--chart-3)"
        label="2026-07-12"
        metricLabel="New stockouts"
        payload={[{ value: 0, payload: { date: "2026-07-12", value: 0 } }]}
      />,
    );

    expect(screen.getByText("Sunday, 12 July 2026")).toBeTruthy();
    expect(screen.getByText("New stockouts")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("supports a metric-specific value label", () => {
    render(
      <DateChartTooltip
        active
        color="var(--chart-2)"
        metricLabel="Monopolies with stock"
        payload={[{ payload: { date: "2026-07-11", value: 1 } }]}
        valueFormatter={(value) => `${value} monopoly`}
      />,
    );

    expect(screen.getByText("1 monopoly")).toBeTruthy();
  });

  it("renders nothing without an active, complete data point", () => {
    const { container, rerender } = render(
      <DateChartTooltip
        active={false}
        color="var(--chart-3)"
        metricLabel="Wines affected"
        payload={[{ payload: { date: "2026-07-12", value: 2 } }]}
      />,
    );

    expect(container.childElementCount).toBe(0);

    rerender(
      <DateChartTooltip active color="var(--chart-3)" metricLabel="Wines affected" payload={[]} />,
    );
    expect(container.childElementCount).toBe(0);
  });
});
