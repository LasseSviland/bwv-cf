import { describe, expect, it } from "vitest";

import { getStatus } from "../src/api/status";
import { MONOPOLIES_KEY, WINES_KEY, dailyInventoryKey } from "../src/storage/keys";
import { MemoryR2 } from "./r2-fixture";

describe("dataset status", () => {
  it("counts only current products in the active wine catalog", async () => {
    const r2 = new MemoryR2();
    r2.seed(WINES_KEY, {
      schemaVersion: 2,
      syncedAt: "2026-07-13T08:00:00.000Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: [
        {
          basic: { productId: "100", productLongName: "Current wine" },
          logistics: { wholesalerName: "Better Wines AS" },
        },
        {
          basic: { productId: "999", productLongName: "Historical wine" },
          logistics: { wholesalerName: "Better Wines AS" },
        },
      ],
      outdatedProducts: { "999": "2026-07-13" },
    });
    r2.seed(MONOPOLIES_KEY, {
      schemaVersion: 1,
      syncedAt: "2026-07-13T08:00:00.000Z",
      source: "vinmonopolet/stores/v0/details",
      monopolies: [{ storeId: "10", storeName: "Store" }],
    });
    r2.seed(dailyInventoryKey("2026-07-13"), {});

    const result = await getStatus({
      DATA_BUCKET: r2.bucket,
      R2_CACHE: r2.cache.namespace,
    } as unknown as Env);

    expect(result.catalog).toEqual({ wines: 1, monopolies: 1 });
  });
});
