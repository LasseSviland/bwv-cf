import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InventoryCalendar } from "../src/components/InventoryCalendar";

describe("InventoryCalendar", () => {
  it("shows every selected month and clearly labels in-stock and sold-out dates", () => {
    render(
      <InventoryCalendar
        from="2026-01-31"
        to="2026-03-01"
        inventory={[{ date: "2026-02-15", count: 8 }]}
        freshness={{ coveredThrough: "2026-03-01" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "January 2026" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "February 2026" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "March 2026" })).toBeTruthy();
    expect(screen.getByLabelText("15 Feb 2026: 8 bottles in stock").textContent).toContain(
      "In stock",
    );
    expect(screen.getByLabelText("14 Feb 2026: sold out").textContent).toContain("Sold out");
  });

  it("marks unpublished and not-yet-covered dates unavailable", () => {
    render(
      <InventoryCalendar
        from="2026-06-30"
        to="2026-07-02"
        inventory={[]}
        freshness={{ coveredThrough: "2026-07-01", missingMonths: ["2026-06"] }}
      />,
    );

    expect(screen.getByLabelText("30 Jun 2026: data unavailable").textContent).toContain(
      "Unavailable",
    );
    expect(screen.getByLabelText("1 Jul 2026: sold out").textContent).toContain("Sold out");
    expect(screen.getByLabelText("2 Jul 2026: data unavailable").textContent).toContain(
      "Unavailable",
    );
  });
});
