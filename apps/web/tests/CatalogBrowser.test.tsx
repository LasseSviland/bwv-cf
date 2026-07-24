import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "../src/api/queryClient";
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

const renderWithQuery = (ui: ReactElement, queryClient: QueryClient = createAppQueryClient()) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const LocationSearch = () => <div data-testid="location-search">{useLocation().search}</div>;

describe("CatalogBrowser", () => {
  it("normalizes punctuation and ranks exact matches before fuzzy matches", () => {
    expect(normalizeSearchText("D'Andézon, Vieilles-Vignes!")).toBe("dandezon vieilles vignes");
    expect(normalizeSearchText("éëèêěẽ Ærø Œuvre Łódź Straße")).toBe(
      "eeeeee aero oeuvre lodz strasse",
    );
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
    const { container } = renderWithQuery(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="items"
          title="Items"
          description="Sorted items"
          searchLabel="Search items"
          searchPlaceholder="Search"
          emptyTitle="No items"
          emptyDescription="Nothing found"
          itemKey={(item) => item}
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

    const loading = screen.getByRole("status");
    expect(loading.textContent).toContain("Loading items");
    expect(loading.querySelector(".animate-spin")).toBeTruthy();
    expect(await screen.findByText("4 results")).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0]?.[1]).toMatchObject({ limit: 75, cursor: undefined });
    expect(load.mock.calls[1]?.[1]).toMatchObject({ limit: 75, cursor: "next-page" });
    expect(
      [...container.querySelectorAll("[data-catalog-item]")].map((item) => item.textContent),
    ).toEqual(["4", "3", "2", "1"]);
  });

  it("uses the requested API page size without rendering every item at once", async () => {
    const items = Array.from({ length: 100 }, (_, index) => index + 1);
    const load = vi.fn((apiKey, values: { cursor?: string }) => {
      void apiKey;
      void values;
      return Promise.resolve({ items, nextCursor: null });
    });
    const { container } = renderWithQuery(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="items"
          title="Items"
          description="Paged items"
          searchLabel="Search items"
          searchPlaceholder="Search"
          emptyTitle="No items"
          emptyDescription="Nothing found"
          itemKey={(item) => item}
          pageSize={1000}
          load={load}
          renderItem={(item) => (
            <span key={item} data-catalog-item={item}>
              {item}
            </span>
          )}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await screen.findByText("100 results");
    expect(load.mock.calls[0]?.[1]).toMatchObject({ limit: 1000, cursor: undefined });
    expect(container.querySelectorAll("[data-catalog-item]")).toHaveLength(75);
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });

  it("searches the complete client-side catalog without another request or spinner", async () => {
    const load = vi.fn<
      (apiKey: string, values: { query?: string }) => Promise<{ items: string[]; nextCursor: null }>
    >(() => Promise.resolve({ items: ["Current Barbera", "Old Barolo"], nextCursor: null }));
    renderWithQuery(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="wines"
          title="Wines"
          searchLabel="Search wines"
          searchPlaceholder="Search"
          emptyTitle="No wines"
          emptyDescription="Nothing found"
          itemKey={(item) => item}
          load={load}
          filterWithoutSearch={(item) => !item.startsWith("Old")}
          renderItem={(item) => <span>{item}</span>}
        />
        <LocationSearch />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Current Barbera")).toBeTruthy();
    expect(screen.queryByText("Old Barolo")).toBeNull();
    const searchbox = screen.getByRole("searchbox", { name: "Search wines" });
    fireEvent.change(searchbox, {
      target: { value: "O" },
    });
    fireEvent.change(searchbox, {
      target: { value: "Ol" },
    });
    fireEvent.change(searchbox, {
      target: { value: "Old" },
    });

    expect(await screen.findByText("Old Barolo")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?q=Old"));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[1]).not.toHaveProperty("query");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sorts the complete result set with the selected dropdown option", async () => {
    const items = [
      { name: "Alpha", stock: 2 },
      { name: "Beta", stock: 9 },
    ];
    const load = vi.fn(() => Promise.resolve({ items, nextCursor: null }));
    const { container } = renderWithQuery(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="stores"
          title="Stores"
          latestOnly
          searchLabel="Search stores"
          searchPlaceholder="Search"
          emptyTitle="No stores"
          emptyDescription="Nothing found"
          itemKey={(item) => item.name}
          load={load}
          defaultSort="name"
          sortOptions={[
            {
              value: "name",
              label: "Name",
              compare: (left, right) => left.name.localeCompare(right.name),
            },
            {
              value: "stock",
              label: "Wines in stock",
              compare: (left, right) => right.stock - left.stock,
            },
          ]}
          renderItem={(item) => <span data-store-name={item.name}>{item.name}</span>}
        />
      </MemoryRouter>,
    );

    await screen.findByText("2 results");
    expect(
      container.querySelector('[data-slot="page-panel"][data-surface="controls"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-slot="page-panel"][data-surface="content"]'),
    ).toBeTruthy();
    const names = () =>
      [...container.querySelectorAll("[data-store-name]")].map((item) => item.textContent);
    expect(names()).toEqual(["Alpha", "Beta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Sort stores" }), {
      target: { value: "stock" },
    });
    expect(names()).toEqual(["Beta", "Alpha"]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("combines selected categories with OR semantics entirely on the client", async () => {
    const items = [
      { name: "Left category four", categories: ["4"] },
      { name: "Right category four", categories: ["4"] },
      { name: "Category five", categories: ["5"] },
      { name: "Category six", categories: ["6"] },
    ];
    const load = vi.fn(() => Promise.resolve({ items, nextCursor: null }));
    renderWithQuery(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="wines"
          title="Wines"
          searchLabel="Search wines"
          searchPlaceholder="Search"
          emptyTitle="No wines"
          emptyDescription="Nothing found"
          itemKey={(item) => item.name}
          categoryFilterLabel="Wine categories"
          categoryValues={(item) => item.categories}
          load={load}
          renderItem={(item) => <span>{item.name}</span>}
        />
        <LocationSearch />
      </MemoryRouter>,
    );

    expect(await screen.findByText("4 results")).toBeTruthy();
    const categoryFour = screen.getByRole("button", { name: "Category 4" });
    const categoryFive = screen.getByRole("button", { name: "Category 5" });

    fireEvent.click(categoryFour);
    expect(await screen.findByText("2 results")).toBeTruthy();
    expect(screen.getByText("Left category four")).toBeTruthy();
    expect(screen.getByText("Right category four")).toBeTruthy();
    expect(screen.queryByText("Category five")).toBeNull();
    expect(categoryFour.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("location-search").textContent).toBe("?category=4");

    fireEvent.click(categoryFive);
    expect(await screen.findByText("3 results")).toBeTruthy();
    expect(screen.getByText("Category five")).toBeTruthy();
    expect(categoryFour.getAttribute("aria-pressed")).toBe("true");
    expect(categoryFive.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("location-search").textContent).toBe("?category=4&category=5");
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a revisited catalog immediately from the shared query cache", async () => {
    const load = vi.fn(() => Promise.resolve({ items: ["Cached Barolo"], nextCursor: null }));
    const queryClient = createAppQueryClient();
    const catalog = (
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CatalogBrowser
          kind="wines"
          title="Wines"
          searchLabel="Search wines"
          searchPlaceholder="Search"
          emptyTitle="No wines"
          emptyDescription="Nothing found"
          itemKey={(item) => item}
          load={load}
          renderItem={(item) => <span>{item}</span>}
        />
      </MemoryRouter>
    );

    const firstVisit = renderWithQuery(catalog, queryClient);
    expect(await screen.findByText("Cached Barolo")).toBeTruthy();
    firstVisit.unmount();

    renderWithQuery(catalog, queryClient);
    expect(screen.getByText("Cached Barolo")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
