import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonopolyStockHistory } from "../src/components/MonopolyStockHistory";

describe("MonopolyStockHistory", () => {
  it("shows the number of monopolies with stock for every covered date", () => {
    render(
      <MonopolyStockHistory
        label="Langhe Nebbiolo"
        stockByDate={[
          { date: "2026-07-11", count: 1 },
          { date: "2026-07-12", count: 8 },
        ]}
      />,
    );

    const chart = screen.getByLabelText("Daily number of monopolies stocking Langhe Nebbiolo");
    expect(chart).toBeTruthy();
    expect(screen.getByText("Monopolies with stock")).toBeTruthy();
    const description = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("11 Jul 2026: 1 monopoly");
    expect(description?.textContent).toContain("12 Jul 2026: 8 monopolies");
    expect(description?.textContent).not.toContain("bottle");
  });
});
