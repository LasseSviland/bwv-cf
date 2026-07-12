import { z } from "zod";

import {
  MonopolySummarySchema,
  WineSummarySchema,
  type MonopolySummary,
  type WineSummary,
} from "@bwv/contracts";

import { HttpError } from "../errors";
import { getCatalogVersion, putCatalogVersions } from "../storage/d1";
import { catalogKey } from "../storage/keys";
import { getRequiredJson, putJson } from "../storage/r2";
import { getSourceCeiling, readSourceCatalogs, withSourceConnection } from "./mysql";

const WineCatalogSchema = z.array(WineSummarySchema);
const MonopolyCatalogSchema = z.array(MonopolySummarySchema);

export async function refreshCatalogs(
  env: Env,
  generation: string,
  fixedSourceCeiling?: number,
): Promise<number> {
  const { catalogs, sourceCeiling } = await withSourceConnection(
    env.HYPERDRIVE,
    async (connection) => {
      // Freeze the inventory ceiling before reading catalogs. A catalog row that
      // appears afterward is harmless; an inventory row after this ceiling is
      // deliberately deferred to the next run.
      const sourceCeiling = fixedSourceCeiling ?? (await getSourceCeiling(connection));
      const catalogs = await readSourceCatalogs(connection);
      return { catalogs, sourceCeiling };
    },
  );
  const wines = WineCatalogSchema.parse(catalogs.wines);
  const monopolies = MonopolyCatalogSchema.parse(catalogs.monopolies);
  const generatedAt = new Date().toISOString();
  const wineKey = catalogKey("wines", generation);
  const monopolyKey = catalogKey("monopolies", generation);

  const wineObject = await putJson(env.DATA_BUCKET, wineKey, wines, "private, max-age=300");
  const monopolyObject = await putJson(
    env.DATA_BUCKET,
    monopolyKey,
    monopolies,
    "private, max-age=300",
  );

  await putCatalogVersions(env.DB, [
    {
      catalog: "wines",
      generation,
      objectKey: wineKey,
      itemCount: wines.length,
      etag: wineObject.etag,
      generatedAt,
    },
    {
      catalog: "monopolies",
      generation,
      objectKey: monopolyKey,
      itemCount: monopolies.length,
      etag: monopolyObject.etag,
      generatedAt,
    },
  ]);
  return sourceCeiling;
}

export async function getWineCatalog(env: Env): Promise<WineSummary[]> {
  const version = await getCatalogVersion(env.DB, "wines");
  if (version === null)
    throw new HttpError(503, "catalog_unavailable", "Wine catalog is unavailable");
  return getRequiredJson(env.DATA_BUCKET, version.objectKey, (value) =>
    WineCatalogSchema.parse(value),
  );
}

export async function getMonopolyCatalog(env: Env): Promise<MonopolySummary[]> {
  const version = await getCatalogVersion(env.DB, "monopolies");
  if (version === null) {
    throw new HttpError(503, "catalog_unavailable", "Monopoly catalog is unavailable");
  }
  return getRequiredJson(env.DATA_BUCKET, version.objectKey, (value) =>
    MonopolyCatalogSchema.parse(value),
  );
}
