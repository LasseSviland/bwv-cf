import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  CatalogBrowser,
  normalizeSearchText,
  rankSearchItems,
} from "../src/components/CatalogBrowser";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ apiKey: "test-key", status: { availableMonths: [] } }),
}));

vi.mock("../src/hooks/usePeriodSearch", () => ({
  usePeriodSearch: () => ({
    period: { from: "2026-06-13", to: "2026-07-12" },
    setPeriod: vi.fn(),
  }),
}));

describe("CatalogBrowser", () => {
  it("normalizes punctuation and ranks exact matches before fuzzy matches", () => {
    expect(normalizeSearchText("D'Andézon, Vieilles-Vignes!")).toBe("dandezon vieilles vignes");
    const results = rankSearchItems(
      ["Sauvignon Blanc", "Sauvignon", "Cabernet"],
      "sauvignon",
      (item) => [item],
    );
    expect(results[0]).toBe("Sauvignon");
    expect(results).not.toContain("Cabernet");

    const tied = rankSearchItems(
      [
        { name: "Bourgogne A", stock: 2 },
        { name: "Bourgogne B", stock: 9 },
      ],
      "bourg",
      (item) => [item.name],
      (left, right) => right.stock - left.stock,
    );
    expect(tied.map((item) => item.name)).toEqual(["Bourgogne B", "Bourgogne A"]);

    const productMatches = rankSearchItems(
      ["Prod. del Barbaresco Langhe Nebbiolo", "Prod. del Barbaresco Barbera", "Langhe Nebbiolo"],
      "prod del b",
      (item) => [item],
      (left, right) => right.localeCompare(left),
    );
    expect(productMatches.slice(0, 2)).toEqual([
      "Prod. del Barbaresco Barbera",
      "Prod. del Barbaresco Langhe Nebbiolo",
    ]);
  });

  it("loads every API page before applying the requested global sort", async () => {
    const load = vi.fn((_apiKey, values: { cursor?: string }) =>
      Promise.resolve(
        values.cursor
          ? { items: [4, 2], nextCursor: null }
          : { items: [1, 3], nextCursor: "next-page" },
      ),
    );
    const { container } = render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="items"
          title="Items"
          description="Sorted items"
          searchLabel="Search items"
          searchPlaceholder="Search"
          emptyTitle="No items"
          emptyDescription="Nothing found"
          load={load}
          sortItems={(left, right) => right - left}
          renderItem={(item) => (
            <span key={item} data-catalog-item={item}>
              {item}
            </span>
          )}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("4 results")).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0]?.[1]).toMatchObject({ limit: 75, cursor: undefined });
    expect(load.mock.calls[1]?.[1]).toMatchObject({ limit: 75, cursor: "next-page" });
    expect(
      [...container.querySelectorAll("[data-catalog-item]")].map((item) => item.textContent),
    ).toEqual(["4", "3", "2", "1"]);
  });

  it("uses the requested API page size without rendering every item at once", async () => {
    const load = vi.fn((apiKey, values: { cursor?: string }) => {
      void apiKey;
      void values;
      return Promise.resolve({ items: [1, 2], nextCursor: null });
    });
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="items"
          title="Items"
          description="Paged items"
          searchLabel="Search items"
          searchPlaceholder="Search"
          emptyTitle="No items"
          emptyDescription="Nothing found"
          pageSize={1000}
          load={load}
          renderItem={(item) => <span key={item}>{item}</span>}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load.mock.calls[0]?.[1]).toMatchObject({ limit: 1000, cursor: undefined });
  });
});
