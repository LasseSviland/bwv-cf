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
  it("loads complete wine details from the single-entity API", async () => {
    const fetchMock = mockFetch({
      id: 7,
      productNumber: "123456",
      name: "Langhe Nebbiolo",
      country: "Italia",
      wineCategory: "Rødvin",
      sourceData: {
        basic: { productId: "123456", volume: 0.75, vintage: 2021 },
        description: { characteristics: { taste: "Fresh and balanced." } },
      },
    });

    const result = await api.getWine("session-key", "7");

    expect(result.sourceData.basic).toEqual({ productId: "123456", volume: 0.75, vintage: 2021 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/wines/7");
  });

  it("loads complete monopoly details from the single-entity API", async () => {
    const fetchMock = mockFetch({
      id: 114,
      storeNumber: "114",
      name: "Oslo, Aker Brygge",
      postalCode: "0250",
      city: "Oslo",
      monopolyCategory: "6",
      sourceData: {
        address: { street: "Bryggegata 9", postalCode: "0250", city: "Oslo" },
        telephone: "22 01 50 00",
      },
    });

    const result = await api.getMonopoly("session-key", "114");

    expect(result.sourceData.telephone).toBe("22 01 50 00");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/monopolies/114");
  });

  it("loads portfolio stockout statistics for the selected period", async () => {
    const fetchMock = mockFetch({
      datasetGeneratedAt: "2026-07-12T08:00:00Z",
      sourceWatermark: 900,
      coveredThrough: "2026-07-12",
      availableDates: ["2026-07-12"],
      period: { from: "2026-07-12", to: "2026-07-12" },
      comparisonDate: "2026-07-11",
      daily: [
        {
          date: "2026-07-12",
          trackedPairs: 10,
          inStockPairs: 8,
          soldOutPairs: 2,
          distinctWinesSoldOut: 1,
          distinctStoresAffected: 2,
          newlySoldOutPairs: 1,
          bottlesLostToStockouts: 3,
          totalBottles: 82,
        },
      ],
      wines: [
        {
          wine: {
            id: 17,
            productNumber: "001234",
            name: "Fjordglimt Riesling",
            assortment: "Basisutvalget",
            assortmentGrades: ["SB6L"],
          },
          fixedStores: 10,
          soldOutDays: 1,
          storeDaysSoldOut: 2,
          currentStoresSoldOut: 2,
          availabilityRate: 0.8,
          peak: { date: "2026-07-12", storesSoldOut: 2 },
          soldOutDates: [{ date: "2026-07-12", storesSoldOut: 2 }],
        },
      ],
      summary: {
        observedDays: 1,
        daysWithStockouts: 1,
        trackedPairs: 10,
        stockoutPairDays: 2,
        distinctPairsSoldOut: 2,
        distinctWinesSoldOut: 1,
        distinctStoresAffected: 2,
        newlySoldOutPairs: 1,
        bottlesLostToStockouts: 3,
        averageDailyStockouts: 2,
        availabilityRate: 0.8,
        peak: { date: "2026-07-12", soldOutPairs: 2 },
      },
    });

    const result = await api.getStatistics("session-key", {
      from: "2026-07-12",
      to: "2026-07-12",
    });

    expect(result.summary.distinctPairsSoldOut).toBe(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/statistics?from=2026-07-12&to=2026-07-12");
  });

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
            bottlesByDate: [
              { date: "2026-07-11", count: 8 },
              { date: "2026-07-12", count: 3 },
            ],
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

  it("queues today's inventory sync through the authenticated admin API", async () => {
    const fetchMock = mockFetch({
      status: "queued",
      date: "2026-07-13",
    });

    await expect(api.startInventorySync("session-key")).resolves.toMatchObject({
      status: "queued",
      date: "2026-07-13",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/admin/sync-inventories");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });
});
