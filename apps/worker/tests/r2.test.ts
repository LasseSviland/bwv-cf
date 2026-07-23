import { describe, expect, it } from "vitest";

import {
  getOptionalJson,
  KV_MAX_VALUE_BYTES,
  listCompletedInventoryDates,
  objectExists,
  parseDailyInventoryFile,
  parseWineCatalogFile,
  putJson,
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

    await expect(putJsonIfAbsent(r2.storage, key, { capture: "first" })).resolves.toBe(true);
    await expect(putJsonIfAbsent(r2.storage, key, { capture: "second" })).resolves.toBe(false);
    expect(r2.values.get(key)).toEqual({ capture: "first" });
  });

  it("checks KV before R2 and serves the second read entirely from KV", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/example.json";
    r2.seed(key, { capture: "r2" });

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "r2",
    });
    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "r2",
    });

    expect(r2.cache.reads).toHaveLength(2);
    expect(r2.cache.writes).toHaveLength(1);
    expect(r2.gets).toEqual([key]);
  });

  it("does not cache missing R2 objects", async () => {
    const r2 = new MemoryR2();
    const key = "inventory/2099-01-01.json";

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toBeNull();
    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toBeNull();

    expect(r2.cache.values.size).toBe(0);
    expect(r2.cache.writes).toHaveLength(0);
    expect(r2.gets).toEqual([key, key]);
  });

  it("uses cached object bodies for existence checks", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/example.json";
    r2.seed(key, { capture: "r2" });

    await expect(objectExists(r2.storage, key)).resolves.toBe(true);
    await expect(objectExists(r2.storage, key)).resolves.toBe(true);

    expect(r2.cache.writes).toHaveLength(1);
    expect(r2.gets).toEqual([key]);
  });

  it("does not cache a failed existence check", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/missing.json";

    await expect(objectExists(r2.storage, key)).resolves.toBe(false);
    await expect(objectExists(r2.storage, key)).resolves.toBe(false);

    expect(r2.cache.writes).toHaveLength(0);
    expect(r2.gets).toEqual([key, key]);
  });

  it("does not cache an R2 object larger than the KV value limit", async () => {
    const r2 = new MemoryR2();
    const key = "inventory/oversized.json";
    r2.seed(key, { capture: "large" }, undefined, KV_MAX_VALUE_BYTES + 1);

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "large",
    });
    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "large",
    });

    expect(r2.cache.values.size).toBe(0);
    expect(r2.cache.writes).toHaveLength(0);
    expect(r2.gets).toEqual([key, key]);
  });

  it("caches an R2 object exactly at the KV value limit", async () => {
    const r2 = new MemoryR2();
    const key = "inventory/at-limit.json";
    r2.seed(key, { capture: "boundary" }, undefined, KV_MAX_VALUE_BYTES);

    await getOptionalJson(r2.storage, key, (value) => value);
    await getOptionalJson(r2.storage, key, (value) => value);

    expect(r2.cache.writes).toHaveLength(1);
    expect(r2.gets).toEqual([key]);
  });

  it("writes updated R2 JSON through to KV", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/example.json";

    await putJson(r2.storage, key, { capture: "new" });

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "new",
    });
    expect(r2.gets).toHaveLength(0);
  });

  it("falls back to R2 when KV is unavailable", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/example.json";
    r2.seed(key, { capture: "r2" });
    r2.cache.failReads = true;
    r2.cache.failWrites = true;

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "r2",
    });
    expect(r2.gets).toEqual([key]);
  });

  it("replaces malformed cached JSON from R2", async () => {
    const r2 = new MemoryR2();
    const key = "catalogs/example.json";
    r2.seed(key, { capture: "r2" });
    r2.cache.values.set(`r2:${key}`, "not-json");

    await expect(getOptionalJson(r2.storage, key, (value) => value)).resolves.toEqual({
      capture: "r2",
    });
    expect(r2.gets).toEqual([key]);
    expect(r2.cache.values.get(`r2:${key}`)).toBe('{"capture":"r2"}');
  });
});
