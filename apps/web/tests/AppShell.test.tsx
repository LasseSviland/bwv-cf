import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/layout/AppShell";

describe("AppShell", () => {
  it("starts every page at the top while keeping browser restoration manual", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Statistics page</h1>} />
            <Route path="wines" element={<h1>Wines page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Statistics" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Statistics" }).getAttribute("aria-label")).toBe(
      "Statistics",
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
    expect(window.history.scrollRestoration).toBe("manual");

    fireEvent.click(screen.getByRole("link", { name: "Wines" }));
    expect(await screen.findByRole("heading", { name: "Wines page" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Wines" })).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
