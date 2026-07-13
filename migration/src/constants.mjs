export const BETTER_WINES_WHOLESALER = "Better Wines AS";
export const DEFAULT_R2_BUCKET = "better-wines-viner-data";
export const INVENTORY_PREFIX = "inventory/";
export const MONOPOLIES_KEY = "catalogs/monopolies.json";
export const WINES_KEY = "catalogs/wines.json";

export const INVENTORY_SOURCE = "vinmonopolet/my-products/v1/stock-per-store";
export const MONOPOLY_SOURCE = "vinmonopolet/stores/v0/details";
export const WINE_SOURCE = "vinmonopolet/my-products/v1/details-normal";

export const DOWNLOAD_STATE_FILE = "download-state.json";
export const MANIFEST_FILE = "manifest.json";
export const UPLOAD_REPORT_FILE = "upload-report.json";

export const WINE_EXPORT_SQL = `
SELECT w.*
  FROM wines AS w
 WHERE w.grossist = ?
 ORDER BY w.id`;

export const MONOPOLY_EXPORT_SQL = `
SELECT m.*,
       COALESCE(
         NULLIF(TRIM(m.gate_postnummer), ''),
         NULLIF(LPAD(CAST(p.code AS CHAR), 4, '0'), '')
       ) AS __postalCode,
       COALESCE(
         NULLIF(TRIM(m.gate_poststed), ''),
         NULLIF(TRIM(p.name), '')
       ) AS __city
  FROM monopolies AS m
  LEFT JOIN post_codes AS p ON p.id = m.post_code_id
 ORDER BY m.id`;

// STRAIGHT_JOIN deliberately walks the inventory primary key once. That avoids
// a large filesort on the unindexed date column while the join/WHERE boundary
// ensures the database returns inventory for Better Wines only.
export const INVENTORY_EXPORT_SQL = `
SELECT i.*,
       CAST(w.varenummer AS CHAR) AS __productNumber,
       CAST(m.butikk_id AS CHAR) AS __storeNumber
  FROM inventories AS i
  STRAIGHT_JOIN wines AS w ON w.id = i.wine_id
  LEFT JOIN monopolies AS m ON m.id = i.monopoly_id
 WHERE i.id > ?
   AND i.id <= ?
   AND w.grossist = ?
 ORDER BY i.id`;
