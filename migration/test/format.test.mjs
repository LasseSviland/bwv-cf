import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BETTER_WINES_WHOLESALER, INVENTORY_EXPORT_SQL } from "../src/constants.mjs";
import {
  mergeWineCatalogs,
  prepareSnapshot,
  sourceDateToIso,
  validateSnapshot,
  wineFromLegacyRow,
} from "../src/format.mjs";

const wineRow = (overrides = {}) => ({
  id: 1,
  varenummer: "100",
  varenavn: "Historic wine",
  grossist: BETTER_WINES_WHOLESALER,
  land: "France",
  butikkategori: "Butikkategori 6",
  ...overrides,
});

test("normalizes source dates and rejects impossible dates", () => {
  assert.equal(sourceDateToIso(20260228), "2026-02-28");
  assert.equal(sourceDateToIso("2024-02-29"), "2024-02-29");
  assert.throws(() => sourceDateToIso(20260229), /Invalid source inventory date/);
});

test("maps only Better Wines rows into the raw Vinmonopolet catalog shape", () => {
  const row = wineRow();
  assert.deepEqual(wineFromLegacyRow(row), {
    basic: { productId: "100", productLongName: "Historic wine" },
    logistics: { wholesalerName: BETTER_WINES_WHOLESALER },
    migration: { source: "legacy-mysql", legacyId: 1 },
    legacyDatabase: row,
    origins: { origin: { country: "France" } },
    classification: { productTypeName: "6" },
  });
  assert.throws(
    () => wineFromLegacyRow(wineRow({ grossist: "Another wholesaler" })),
    /does not belong to Better Wines/,
  );
  assert.match(INVENTORY_EXPORT_SQL, /w\.grossist = \?/);
  assert.match(INVENTORY_EXPORT_SQL, /ORDER BY i\.id/);
});

test("merges current API records over historic records and removes other wholesalers", () => {
  const historicWine = wineFromLegacyRow(wineRow());
  const historic = {
    schemaVersion: 1,
    syncedAt: "2026-01-01T00:00:00.000Z",
    source: "vinmonopolet/my-products/v1/details-normal",
    wholesaler: BETTER_WINES_WHOLESALER,
    wines: [historicWine],
  };
  const current = {
    ...historic,
    wines: [
      {
        basic: { productId: "100", productLongName: "Current name" },
        logistics: { wholesalerName: BETTER_WINES_WHOLESALER },
      },
      {
        basic: { productId: "999", productLongName: "Wrong owner" },
        logistics: { wholesalerName: "Another wholesaler" },
      },
    ],
  };
  const merged = mergeWineCatalogs(historic, current, "2026-07-13T00:00:00.000Z");
  assert.equal(merged.wines.length, 1);
  assert.equal(merged.wines[0].basic.productLongName, "Current name");
  assert.deepEqual(merged.wines[0].migration, historicWine.migration);
});

test("prepares one compatible inventory file per date and keeps the latest observation", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "bwv-migration-"));
  try {
    await mkdir(join(root, "raw"), { recursive: true });
    await writeFile(join(root, "raw", "wines.ndjson"), `${JSON.stringify(wineRow())}\n`);
    await writeFile(
      join(root, "raw", "monopolies.ndjson"),
      `${JSON.stringify({
        id: 5,
        butikk_id: "10",
        butikknavn: "Historic store",
        __postalCode: "0123",
        __city: "Oslo",
        kategori: "Kategori 4",
      })}\n`,
    );
    const inventory = [
      { id: 1, date: 20260101, count: 3, __productNumber: "100", __storeNumber: "10" },
      { id: 2, date: 20260101, count: 0, __productNumber: "100", __storeNumber: "10" },
      { id: 3, date: 20260102, count: 4, __productNumber: "100", __storeNumber: "10" },
    ];
    await writeFile(
      join(root, "raw", "inventories.ndjson"),
      `${inventory.map((row) => JSON.stringify(row)).join("\n")}\n`,
    );
    const state = {
      startedAt: "2026-07-13T00:00:00.000Z",
      inventoryCeilingId: 3,
      wineRows: 1,
      monopolyRows: 1,
    };
    const manifest = await prepareSnapshot(root, state, "2026-07-13T00:00:00.000Z");
    assert.equal(manifest.cloudflare.inventoryFiles, 2);
    assert.equal(manifest.cloudflare.positiveInventoryObservations, 1);

    const first = JSON.parse(
      await readFile(join(root, "cloudflare", "inventory", "2026-01-01.json"), "utf8"),
    );
    const second = JSON.parse(
      await readFile(join(root, "cloudflare", "inventory", "2026-01-02.json"), "utf8"),
    );
    assert.deepEqual(first.products, []);
    assert.deepEqual(second.products, [
      { productId: "100", stock: [{ storeId: "10", storeStock: 4 }] },
    ]);
    await validateSnapshot(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
