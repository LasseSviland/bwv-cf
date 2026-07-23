import { describe, expect, it } from "vitest";

import { loadInventoryObservations } from "../src/api/daily-inventory";
import { MemoryR2 } from "./r2-fixture";

describe("daily inventory loading", () => {
  it("loads one file per date and returns only positive stock for requested wines", async () => {
    const r2 = new MemoryR2();
    r2.seed("inventory/2026-07-13.json", {
      schemaVersion: 1,
      syncedAt: "2026-07-13T08:00:00.000Z",
      date: "2026-07-13",
      source: "vinmonopolet/my-products/v1/stock-per-store",
      products: [
        {
          productId: "100",
          stock: [
            { storeId: "10", storeStock: 3, lastChanged: { date: "2026-07-13" } },
            { storeId: "11", storeStock: 0 },
          ],
        },
        { productId: "200", stock: [{ storeId: "10", storeStock: 9 }] },
      ],
    });

    await expect(loadInventoryObservations(r2.storage, ["2026-07-13"], ["100"])).resolves.toEqual([
      { date: "2026-07-13", productId: "100", storeId: "10", count: 3 },
    ]);
  });
});
