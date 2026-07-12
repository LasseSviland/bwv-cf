import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CatalogBrowser } from "../src/components/CatalogBrowser";

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
});
