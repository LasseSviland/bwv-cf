import mysql, { type Connection } from "mysql2/promise";

import type { MonopolySummary, WineSummary } from "@bwv/contracts";

import { PermanentQueueError } from "../errors";
import type {
  InventorySourceRow,
  MonopolySourceRow,
  ScalarIdRow,
  SourceBoundRow,
  WineSourceRow,
} from "../types";
import { sourceBoundsForMonth } from "./source-date";

// The first controlled production run completed hundreds of sequential 1,000-row
// pages without source pressure or query failures. Keep one query at a time, but
// use a larger bounded page to reduce Queue and connection overhead.
export const DEFAULT_SOURCE_PAGE_SIZE = 5_000;
export const BETTER_WINES_GROSSIST = "Better Wines AS";

export function cleanCategory(value: string | null, prefix: string): string | null {
  const category = value
    ?.trim()
    .replace(new RegExp(`^${prefix}\\s*`, "i"), "")
    .trim();
  return category || null;
}

type SourceConnection = Connection;

export async function withSourceConnection<T>(
  hyperdrive: Hyperdrive,
  operation: (connection: SourceConnection) => Promise<T>,
): Promise<T> {
  const connection = await mysql.createConnection({
    host: hyperdrive.host,
    port: hyperdrive.port,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    disableEval: true,
    connectTimeout: 15_000,
    dateStrings: true,
  });

  try {
    await connection.query("SET SESSION TRANSACTION READ ONLY");
    return await operation(connection);
  } finally {
    await connection.end();
  }
}

export async function discoverSourceMonthBounds(
  connection: SourceConnection,
  fromMonth: string,
  throughMonth: string,
  ceilingId: number,
): Promise<SourceBoundRow[]> {
  const from = sourceBoundsForMonth(fromMonth).from;
  const through = sourceBoundsForMonth(throughMonth).through;
  const [rows] = await connection.query<SourceBoundRow[]>(
    `SELECT FLOOR(date / 100) AS monthKey,
            MIN(id) AS floorId,
            MAX(id) AS ceilingId,
            COUNT(*) AS sourceRowCount
       FROM inventories
      WHERE date >= ? AND date <= ? AND id <= ?
      GROUP BY FLOOR(date / 100)
      ORDER BY monthKey`,
    [from, through, ceilingId],
  );
  return rows;
}

export async function discoverSingleMonthBound(
  connection: SourceConnection,
  month: string,
  ceilingId: number,
): Promise<SourceBoundRow | null> {
  const { from, through } = sourceBoundsForMonth(month);
  const [rows] = await connection.query<SourceBoundRow[]>(
    `SELECT FLOOR(? / 100) AS monthKey,
            MIN(id) AS floorId,
            MAX(id) AS ceilingId,
            COUNT(*) AS sourceRowCount
       FROM inventories
      WHERE date >= ? AND date <= ? AND id <= ?`,
    [from, from, through, ceilingId],
  );
  const row = rows[0];
  if (row === undefined || row.floorId === null || row.ceilingId === null) return null;
  return row;
}

export async function getSourceCeiling(connection: SourceConnection): Promise<number> {
  const [rows] = await connection.query<ScalarIdRow[]>("SELECT MAX(id) AS id FROM inventories");
  const ceiling = rows[0]?.id;
  if (ceiling === null || ceiling === undefined) return 0;
  if (!Number.isSafeInteger(ceiling) || ceiling < 0) {
    throw new PermanentQueueError("Source returned an invalid inventory ceiling");
  }
  return ceiling;
}

export async function readInventoryPage(
  connection: SourceConnection,
  cursorId: number,
  ceilingId: number,
  pageSize = DEFAULT_SOURCE_PAGE_SIZE,
): Promise<InventorySourceRow[]> {
  const [rows] = await connection.query<InventorySourceRow[]>(
    `SELECT id,
            date,
            count,
            wine_id AS wineId,
            monopoly_id AS monopolyId
       FROM inventories
      WHERE id > ? AND id <= ?
      ORDER BY id
      LIMIT ?`,
    [cursorId, ceilingId, pageSize],
  );
  return rows;
}

export async function readSourceCatalogs(
  connection: SourceConnection,
): Promise<{ monopolies: MonopolySummary[]; wines: WineSummary[] }> {
  const [wineRows] = await connection.query<WineSourceRow[]>(
    `SELECT id,
            varenummer AS productNumber,
            varenavn AS name,
            NULLIF(TRIM(land), '') AS country,
            NULLIF(TRIM(butikkategori), '') AS wineCategory
       FROM wines
      WHERE grossist = ?
      ORDER BY id`,
    [BETTER_WINES_GROSSIST],
  );
  const [monopolyRows] = await connection.query<MonopolySourceRow[]>(
    `SELECT m.id,
            m.butikk_id AS storeNumber,
            m.butikknavn AS name,
            COALESCE(
              NULLIF(TRIM(m.gate_postnummer), ''),
              NULLIF(LPAD(CAST(p.code AS CHAR), 4, '0'), '')
            ) AS postalCode,
            COALESCE(
              NULLIF(TRIM(m.gate_poststed), ''),
              NULLIF(TRIM(p.name), '')
            ) AS city,
            NULLIF(TRIM(m.kategori), '') AS monopolyCategory
       FROM monopolies m
       LEFT JOIN post_codes p ON p.id = m.post_code_id
      ORDER BY m.id`,
  );

  const wines = wineRows.map((row) => ({
    id: row.id,
    productNumber: row.productNumber,
    name: row.name,
    country: row.country,
    wineCategory: cleanCategory(row.wineCategory, "Butikkategori"),
  }));
  const monopolies = monopolyRows.map((row) => ({
    id: row.id,
    storeNumber: row.storeNumber,
    name: row.name,
    postalCode: row.postalCode,
    city: row.city,
    monopolyCategory: cleanCategory(row.monopolyCategory, "Kategori"),
  }));
  return { wines, monopolies };
}
