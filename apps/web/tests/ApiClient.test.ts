import { describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/api/client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mockFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("API contract validation", () => {
  it("returns a catalog only after it passes the shared wine catalog schema", async () => {
    const fetchMock = mockFetch({
      items: [
        {
          id: 7,
          productNumber: "123456",
          name: "Langhe Nebbiolo",
          country: "Italy",
          availability: {
            soldOutAtSomePoint: 2,
            inStockAtSomePoint: 4,
            currentlyInStock: 1,
          },
        },
      ],
      nextCursor: null,
    });

    const result = await api.getWines("session-key", { query: "Langhe", limit: 25 });

    expect(result.items[0]?.name).toBe("Langhe Nebbiolo");
    expect(result.nextCursor).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/wines?query=Langhe&limit=25");
  });

  it("rejects malformed successful responses before UI code can consume them", async () => {
    mockFetch({
      items: [{ id: "not-a-number", productNumber: "123456", name: "Invalid wine" }],
      nextCursor: null,
    });

    try {
      await api.getWines("session-key");
      expect.fail("Expected the malformed catalog to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) return;
      expect(error.status).toBe(502);
      expect(error.code).toBe("invalid_response");
    }
  });

  it("applies the shared inventory refinements to dates and series", async () => {
    mockFetch({
      wine: { id: 7, productNumber: "123456", name: "Langhe Nebbiolo", country: "Italy" },
      period: { from: "2026-07-01", to: "2026-07-02" },
      monopolies: [
        {
          monopoly: { id: 9, storeNumber: "123", name: "Oslo Majorstuen" },
          inventory: [{ date: "2026-06-30", count: 4 }],
        },
      ],
      datasetGeneratedAt: "2026-07-02T08:00:00Z",
      sourceWatermark: 900,
      coveredThrough: "2026-07-02",
    });

    await expect(
      api.getWineInventory("session-key", "7", {
        from: "2026-07-01",
        to: "2026-07-02",
      }),
    ).rejects.toMatchObject({ status: 502, code: "invalid_response" });
  });

  it("parses structured API errors with the shared error schema", async () => {
    mockFetch(
      {
        error: {
          code: "not_found",
          message: "Wine not found.",
          requestId: "request-123",
        },
      },
      404,
    );

    try {
      await api.getWine("session-key", "404");
      expect.fail("Expected the API error to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) return;
      expect(error.status).toBe(404);
      expect(error.code).toBe("not_found");
      expect(error.requestId).toBe("request-123");
      expect(error.message).toBe("Wine not found.");
    }
  });

  it("queues a full historical backfill through the authenticated admin API", async () => {
    const fetchMock = mockFetch({
      jobId: "job-123",
      status: "queued",
      months: ["2024-01", "2024-02"],
    });

    await expect(api.startHistoricalBackfill("session-key")).resolves.toMatchObject({
      jobId: "job-123",
      status: "queued",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/backfill");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: "{}" });
  });
});
