import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/auth/AuthProvider";
import { PasswordGate } from "../src/auth/PasswordGate";

const status = {
  freshness: {
    datasetGeneratedAt: "2026-07-12T08:00:00Z",
    sourceWatermark: 123,
    coveredThrough: "2026-07-12",
  },
  availableMonths: ["2026-07"],
  catalog: { wines: 12, monopolies: 30 },
};

describe("PasswordGate", () => {
  it("validates the password with a bearer request and keeps it in local storage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(screen.getByRole("heading", { name: "Enter password to access" })).toBeTruthy();
    expect(screen.getByRole("main").className).toContain("fixed inset-0 overflow-y-auto");
    expect(screen.queryByText(/better wines|vinmonopolet|inventory/i)).toBeNull();
    expect(document.title).toBe("Private access");
    await user.type(screen.getByLabelText("Access password"), "test-session-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe("/api/v1/status");
    expect(new Headers(requestOptions?.headers).get("Authorization")).toBe(
      "Bearer test-session-key",
    );
    expect(localStorage.getItem("better-wines:api-key")).toBe("test-session-key");
  });

  it("does not unlock or retain a rejected password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("Access password"), "wrong-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toContain("password was not accepted");
    expect(screen.queryByText("Private inventory")).toBeNull();
    expect(localStorage.getItem("better-wines:api-key")).toBeNull();
  });

  it("accepts an API key link, removes the credential from the URL, and unlocks", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      null,
      "",
      "/wines?from=2026-07-01&apiKey=shared-link-key#inventory",
    );

    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    expect(localStorage.getItem("better-wines:api-key")).toBe("shared-link-key");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/wines?from=2026-07-01#inventory",
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer shared-link-key",
    );
  });

  it("migrates the previous session-scoped key into persistent storage", async () => {
    sessionStorage.setItem("better-wines:api-key", "legacy-session-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(status), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    expect(localStorage.getItem("better-wines:api-key")).toBe("legacy-session-key");
    expect(sessionStorage.getItem("better-wines:api-key")).toBeNull();
  });

  it("keeps an accepted password in persistent storage when access is locked", async () => {
    localStorage.setItem("better-wines:api-key", "remembered-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(status), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const view = render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    await act(() => Promise.resolve(window.dispatchEvent(new Event("better-wines:unauthorized"))));
    expect(await screen.findByRole("heading", { name: "Enter password to access" })).toBeTruthy();
    expect(localStorage.getItem("better-wines:api-key")).toBe("remembered-key");

    view.unmount();
    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    expect(localStorage.getItem("better-wines:api-key")).toBe("remembered-key");
  });

  it("retries a temporary access-check failure with the saved password", async () => {
    localStorage.setItem("better-wines:api-key", "remembered-key");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(status), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <PasswordGate>
          <p>Private inventory</p>
        </PasswordGate>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Access check unavailable" })).toBeTruthy();
    expect(localStorage.getItem("better-wines:api-key")).toBe("remembered-key");
    await user.click(screen.getByRole("button", { name: "Try saved password again" }));

    expect(await screen.findByText("Private inventory")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("better-wines:api-key")).toBe("remembered-key");
  });
});
