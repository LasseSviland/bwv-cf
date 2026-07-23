import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BottleHistory } from "../src/components/BottleHistory";

describe("BottleHistory", () => {
  it("shows the exact bottle total for every covered date", () => {
    render(
      <BottleHistory
        label="Langhe Nebbiolo"
        inventory={[
          { date: "2026-07-11", count: 0 },
          { date: "2026-07-12", count: 8 },
        ]}
      />,
    );

    const chart = screen.getByLabelText("Daily bottle count for Langhe Nebbiolo");
    expect(chart).toBeTruthy();
    const description = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("11 Jul 2026: 0 bottles");
    expect(description?.textContent).toContain("12 Jul 2026: 8 bottles");
    expect(screen.queryByText("8 latest")).toBeNull();
    expect(description?.textContent?.startsWith("12 Jul 2026: 8 bottles")).toBe(true);
  });
});
