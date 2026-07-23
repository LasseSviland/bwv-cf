import { describe, expect, it, vi } from "vitest";
import { API_DATA_FRESHNESS_MS, createAppQueryClient } from "../src/api/queryClient";

describe("app query cache", () => {
  it("reuses data for four hours and refreshes it after the freshness boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T08:00:00Z"));
    const queryClient = createAppQueryClient();
    const loader = vi.fn().mockResolvedValue("wine data");
    const options = { queryKey: ["api", "wines"] as const, queryFn: loader };

    try {
      await expect(queryClient.fetchQuery(options)).resolves.toBe("wine data");
      vi.advanceTimersByTime(API_DATA_FRESHNESS_MS - 1);
      await expect(queryClient.fetchQuery(options)).resolves.toBe("wine data");
      expect(loader).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2);
      await expect(queryClient.fetchQuery(options)).resolves.toBe("wine data");
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      queryClient.clear();
      vi.useRealTimers();
    }
  });

  it("starts with an empty cache after a full page creates a new client", async () => {
    const loader = vi.fn().mockResolvedValue("wine data");
    const options = { queryKey: ["api", "wines"] as const, queryFn: loader };

    await createAppQueryClient().fetchQuery(options);
    await createAppQueryClient().fetchQuery(options);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
