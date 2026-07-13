import {
  MonopolySummarySchema,
  WineSummarySchema,
  type MonopolySummary,
  type WineSummary,
} from "@bwv/contracts";

import { HttpError } from "../errors";
import { getCatalogState, listMonopolies, listWines, replaceCatalogs } from "../storage/d1";
import { getSourceCeiling, readSourceCatalogs, withSourceConnection } from "./mysql";

export async function refreshCatalogs(
  env: Env,
  generation: string,
  fixedSourceCeiling?: number,
): Promise<number> {
  const { catalogs, sourceCeiling } = await withSourceConnection(
    env.HYPERDRIVE,
    async (connection) => {
      const sourceCeiling = fixedSourceCeiling ?? (await getSourceCeiling(connection));
      const catalogs = await readSourceCatalogs(connection);
      return { catalogs, sourceCeiling };
    },
  );
  const wines = catalogs.wines.map((wine) => WineSummarySchema.parse(wine));
  const monopolies = catalogs.monopolies.map((monopoly) => MonopolySummarySchema.parse(monopoly));
  await replaceCatalogs(env.DB, generation, new Date().toISOString(), wines, monopolies);
  return sourceCeiling;
}

async function requireCatalog(env: Env): Promise<void> {
  if ((await getCatalogState(env.DB)) === null) {
    throw new HttpError(503, "catalog_unavailable", "Catalog is unavailable");
  }
}

export async function getWineCatalog(env: Env): Promise<WineSummary[]> {
  await requireCatalog(env);
  return listWines(env.DB);
}

export async function getMonopolyCatalog(env: Env): Promise<MonopolySummary[]> {
  await requireCatalog(env);
  return listMonopolies(env.DB);
}
