import { describe, expect, it } from "vitest";

import {
  listCompletedInventoryDates,
  parseDailyInventoryFile,
  parseWineCatalogFile,
  putJsonIfAbsent,
} from "../src/storage/r2";
import { MemoryR2 } from "./r2-fixture";

describe("R2 JSON storage", () => {
  it("lists only dated inventory files as completed days", async () => {
    const r2 = new MemoryR2();
    r2.seed("inventory/2026-07-12.json", {});
    r2.seed("inventory/readme.json", {});
    r2.seed("catalogs/wines.json", {});

    await expect(listCompletedInventoryDates(r2.bucket)).resolves.toEqual([
      expect.objectContaining({ date: "2026-07-12" }),
    ]);
  });

  it("preserves every raw product and stock field", () => {
    const source = {
      schemaVersion: 1,
      syncedAt: "2026-07-13T08:00:00.000Z",
      date: "2026-07-13",
      source: "vinmonopolet/my-products/v1/stock-per-store",
      products: [{ productId: "123", stock: [{ storeId: "1", storeStock: 4, extra: true }] }],
    };
    expect(parseDailyInventoryFile(source)).toEqual(source);
  });

  it("upgrades a legacy wine catalog and validates outdated product dates", () => {
    const legacy = {
      schemaVersion: 1,
      syncedAt: "2026-07-12T08:00:00.000Z",
      source: "vinmonopolet/my-products/v1/details-normal",
      wholesaler: "Better Wines AS",
      wines: [],
    };
    expect(parseWineCatalogFile(legacy)).toMatchObject({
      schemaVersion: 2,
      outdatedProducts: {},
    });
    expect(() =>
      parseWineCatalogFile({
        ...legacy,
        schemaVersion: 2,
        outdatedProducts: { "100": "2026-02-30" },
      }),
    ).toThrow("must be a valid date");
  });

  it("creates a daily object only when its key is absent", async () => {
    const r2 = new MemoryR2();
    const key = "inventory/2026-07-13.json";

    await expect(putJsonIfAbsent(r2.bucket, key, { capture: "first" })).resolves.toBe(true);
    await expect(putJsonIfAbsent(r2.bucket, key, { capture: "second" })).resolves.toBe(false);
    expect(r2.values.get(key)).toEqual({ capture: "first" });
  });
});
