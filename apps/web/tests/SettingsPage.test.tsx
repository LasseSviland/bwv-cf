import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/api/client";
import { SettingsPage } from "../src/pages/SettingsPage";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ apiKey: "session-key" }),
}));

describe("SettingsPage", () => {
  it("shows a spinner while the sync request is running", async () => {
    const user = userEvent.setup();
    let resolveSync: ((value: { status: "queued"; date: string }) => void) | undefined;
    vi.spyOn(api, "startInventorySync").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Sync inventories now" }));

    const button = screen.getByRole("button", { name: "Adding to queue…" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".animate-spin")).toBeTruthy();

    resolveSync?.({ status: "queued", date: "2026-07-13" });
    expect(
      await screen.findByText("The inventory sync for 2026-07-13 was added to the queue."),
    ).toBeTruthy();
  });

  it("queues the daily sync and confirms the requested date", async () => {
    const user = userEvent.setup();
    const startSync = vi.spyOn(api, "startInventorySync").mockResolvedValue({
      status: "queued",
      date: "2026-07-13",
    });

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Sync inventories now" }));

    expect(startSync).toHaveBeenCalledWith("session-key");
    expect(
      await screen.findByText("The inventory sync for 2026-07-13 was added to the queue."),
    ).toBeTruthy();
  });
});
