import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InventoryMatrix } from "../src/components/InventoryMatrix";

describe("InventoryMatrix", () => {
  it("renders positive counts as in stock and missing/zero observations as sold out", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InventoryMatrix
          rows={[
            {
              id: "7",
              label: "Oslo Majorstuen",
              secondary: "Store 123 · 0366 Oslo",
              href: "/wines/9/monopolies/7",
              inventory: [
                { date: "2026-07-10", count: 4 },
                { date: "2026-07-12", count: 0 },
              ],
            },
          ]}
          from="2026-07-10"
          to="2026-07-12"
          entityLabel="Monopoly"
          emptyTitle="No stores"
          emptyDescription="No inventory"
          freshness={{ coveredThrough: "2026-07-12" }}
        />
      </MemoryRouter>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByLabelText("10 Jul 2026: 4 bottles in stock").textContent).toContain(
      "4",
    );
    expect(within(table).getByLabelText("11 Jul 2026: sold out").textContent).toContain("—");
    expect(within(table).getByLabelText("12 Jul 2026: sold out").textContent).toContain("—");
    expect(within(table).getByRole("link", { name: "Oslo Majorstuen" }).getAttribute("href")).toBe(
      "/wines/9/monopolies/7",
    );
  });

  it("renders dates outside published coverage as unavailable, never sold out", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InventoryMatrix
          rows={[
            {
              id: "7",
              label: "Oslo Majorstuen",
              secondary: "Store 123",
              href: "/monopolies/7",
              inventory: [],
            },
          ]}
          from="2026-06-30"
          to="2026-07-02"
          entityLabel="Monopoly"
          emptyTitle="No stores"
          emptyDescription="No inventory"
          freshness={{ coveredThrough: "2026-07-01", missingMonths: ["2026-06"] }}
        />
      </MemoryRouter>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByLabelText("30 Jun 2026: data unavailable")).toBeTruthy();
    expect(within(table).getByLabelText("1 Jul 2026: sold out")).toBeTruthy();
    expect(within(table).getByLabelText("2 Jul 2026: data unavailable")).toBeTruthy();
  });

  it("renders a missing daily inventory file inside the covered month as unavailable", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InventoryMatrix
          rows={[
            {
              id: "7",
              label: "Oslo Majorstuen",
              secondary: "Store 123",
              href: "/monopolies/7",
              inventory: [],
            },
          ]}
          from="2026-07-10"
          to="2026-07-12"
          entityLabel="Monopoly"
          emptyTitle="No stores"
          emptyDescription="No inventory"
          freshness={{
            coveredThrough: "2026-07-12",
            availableDates: ["2026-07-10", "2026-07-12"],
          }}
        />
      </MemoryRouter>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByLabelText("10 Jul 2026: sold out")).toBeTruthy();
    expect(within(table).getByLabelText("11 Jul 2026: data unavailable")).toBeTruthy();
    expect(within(table).getByLabelText("12 Jul 2026: sold out")).toBeTruthy();
  });

  it("marks optional local stock as additional instead of sold out", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InventoryMatrix
          rows={[
            {
              id: "7",
              label: "Optional Barolo",
              secondary: "Basisutvalget · category 5R",
              assortmentStatus: "additional",
              assortmentNote:
                "Not part of this store's fixed assortment (wine category 5R; store category 3R).",
              href: "/wines/7",
              inventory: [
                { date: "2026-07-10", count: 2 },
                { date: "2026-07-12", count: 0 },
              ],
            },
          ]}
          from="2026-07-10"
          to="2026-07-12"
          entityLabel="Wine"
          emptyTitle="No wines"
          emptyDescription="No inventory"
          freshness={{ coveredThrough: "2026-07-12" }}
        />
      </MemoryRouter>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("Additional product")).toBeTruthy();
    expect(
      within(table).getByLabelText("10 Jul 2026: 2 bottles in stock; additional product"),
    ).toBeTruthy();
    expect(
      within(table).getByLabelText("11 Jul 2026: not currently stocked; additional product"),
    ).toBeTruthy();
    expect(within(table).queryByLabelText(/sold out/i)).toBeNull();
    expect(
      screen.getByText(
        "Sold out means the product was expected as part of the store's fixed assortment. Additional products are optional local stock.",
      ),
    ).toBeTruthy();
  });
});
