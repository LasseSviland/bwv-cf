import { describe, expect, it, vi } from "vitest";

import type { SyncQueueMessage } from "@bwv/contracts";

import {
  processQueueMessage,
  queueDeliveryExhausted,
  queueRetryDelay,
} from "../src/ingestion/queue";
import { MONOPOLIES_KEY, WINES_KEY, dailyInventoryKey } from "../src/storage/keys";
import type { JsonObject } from "../src/types";
import { MemoryR2 } from "./r2-fixture";

const message: SyncQueueMessage = {
  version: 1,
  type: "start-sync",
  trigger: "manual",
  date: "2026-07-13",
};

const wine = (productId: string, name: string, extra: JsonObject = {}): JsonObject => ({
  basic: { productId, productLongName: name },
  logistics: { wholesalerName: "Better Wines AS" },
  ...extra,
});

const monopoly = (storeId: string, storeName: string, extra: JsonObject = {}): JsonObject => ({
  storeId,
  storeName,
  ...extra,
});

const requestUrl = (input: RequestInfo | URL): URL =>
  new URL(input instanceof URL ? input.href : typeof input === "string" ? input : input.url);

function envFor(r2: MemoryR2): Env {
  return {
    DATA_BUCKET: r2.bucket,
    VINMONOPOLET_OPEN_API_KEY: "open-key",
    VINMONOPOLET_RESTRICTED_API_KEY: "restricted-key",
  } as unknown as Env;
}

describe("single-message sync", () => {
  it("merges both catalogs and stores the complete stock response in one daily file", async () => {
    const r2 = new MemoryR2();
    r2.seed(WINES_KEY, {
      schemaVersion: 1,
      syncedAt: "2026-07-12T08:00:00.000Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: [
        wine("100", "Old name", {
          legacyField: "preserved",
          classification: { productTypeName: "Old category", omittedByCurrent: "preserved" },
        }),
        wine("999", "Deleted wine"),
      ],
    });
    r2.seed(MONOPOLIES_KEY, {
      schemaVersion: 1,
      syncedAt: "2026-07-12T08:00:00.000Z",
      source: "vinmonopolet/stores/v0/details",
      monopolies: [
        monopoly("10", "Old store name", { legacyField: "preserved" }),
        monopoly("99", "Deleted store"),
      ],
    });
    const stock = [
      {
        productId: "100",
        stock: [{ storeId: "10", storeStock: 4, lastChanged: { date: "2026-07-13" } }],
        unknownTopLevelField: "preserved",
      },
    ];
    const urls: string[] = [];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url.toString());
      if (url.pathname.endsWith("/details-normal")) {
        return Promise.resolve(
          Response.json([
            wine("100", "New name", {
              classification: { productTypeName: "New category" },
            }),
            wine("200", "New wine"),
          ]),
        );
      }
      if (url.pathname.endsWith("/stores/v0/details")) {
        return Promise.resolve(
          Response.json([monopoly("10", "New store name"), monopoly("20", "New store")]),
        );
      }
      return Promise.resolve(Response.json(stock));
    });

    await expect(
      processQueueMessage(message, envFor(r2), fetchFn, () => new Date("2026-07-13T08:00:00Z")),
    ).resolves.toMatchObject({ outcome: "completed" });

    expect(urls.map((value) => new URL(value).pathname)).toEqual([
      "/my-products/v1/details-normal",
      "/stores/v0/details",
      "/my-products/v1/stock-per-store",
    ]);
    expect(urls.every((value) => new URL(value).search === "")).toBe(true);

    const wineFile = r2.values.get(WINES_KEY) as { wines: JsonObject[] };
    expect(wineFile.wines).toHaveLength(3);
    expect(
      wineFile.wines.find((value) => value.basic && JSON.stringify(value).includes("100")),
    ).toMatchObject({
      basic: { productLongName: "New name" },
      legacyField: "preserved",
      classification: { productTypeName: "New category", omittedByCurrent: "preserved" },
    });
    const monopolyFile = r2.values.get(MONOPOLIES_KEY) as { monopolies: JsonObject[] };
    expect(monopolyFile.monopolies).toHaveLength(3);
    expect(monopolyFile.monopolies).toContainEqual(
      expect.objectContaining({ storeId: "99", storeName: "Deleted store" }),
    );
    expect(r2.values.get(dailyInventoryKey("2026-07-13"))).toMatchObject({ products: stock });
  });

  it("always refreshes both catalogs but skips an existing daily inventory file", async () => {
    const r2 = new MemoryR2();
    r2.seed(dailyInventoryKey("2026-07-13"), { already: "complete" });
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const path = requestUrl(input).pathname;
      if (path.endsWith("/details-normal")) {
        return Promise.resolve(Response.json([wine("100", "Wine")]));
      }
      if (path.endsWith("/stores/v0/details")) {
        return Promise.resolve(Response.json([monopoly("10", "Store")]));
      }
      throw new Error("Stock API should not be called for an existing day");
    });

    await expect(processQueueMessage(message, envFor(r2), fetchFn)).resolves.toMatchObject({
      outcome: "skipped",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("backs off transient failures with a cap", () => {
    expect(queueRetryDelay(1)).toBe(30);
    expect(queueRetryDelay(2)).toBe(60);
    expect(queueRetryDelay(99)).toBe(3_600);
    expect(queueDeliveryExhausted(5)).toBe(false);
    expect(queueDeliveryExhausted(6)).toBe(true);
  });
});
