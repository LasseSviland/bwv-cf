import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonopolyStockHistory } from "../src/components/MonopolyStockHistory";

describe("MonopolyStockHistory", () => {
  it("shows the number of monopolies with stock for every covered date", () => {
    const stockByDate = Array.from({ length: 20 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      count: index + 1,
    }));
    const { container } = render(
      <MonopolyStockHistory label="Langhe Nebbiolo" stockByDate={stockByDate} />,
    );

    const chart = screen.getByRole("application", {
      name: "Daily number of monopolies stocking Langhe Nebbiolo",
    });
    expect(chart).toBeTruthy();
    expect(
      container.querySelector('[data-chart-library="recharts"]')?.getAttribute("data-chart-points"),
    ).toBe("20");
    expect(screen.getByText("Monopolies with stock")).toBeTruthy();
    const description = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("1 Jul 2026: 1 monopoly");
    expect(description?.textContent).toContain("20 Jul 2026: 20 monopolies");
    expect(description?.textContent).not.toContain("bottle");
  });

  it("keeps an accessible chart state when no dates are covered", () => {
    render(<MonopolyStockHistory label="Empty Wine" stockByDate={[]} />);

    expect(
      screen
        .getByRole("application", {
          name: "Daily number of monopolies stocking Empty Wine",
        })
        .getAttribute("data-chart-points"),
    ).toBe("0");
    expect(screen.getByText("No covered dates")).toBeTruthy();
  });
});
