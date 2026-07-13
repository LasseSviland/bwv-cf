import type { CatalogResponse, MonopolySummary, WineSummary } from "@bwv/contracts";
import { CursorError, nextCatalogCursor, resolveCatalogCursor } from "@bwv/data-format";

import { HttpError } from "../errors";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1_000;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("nb-NO");
}

export function parseEntityId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new HttpError(400, "invalid_id", "Invalid entity id");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, "invalid_id", "Invalid entity id");
  return parsed;
}

export function parseCatalogLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new HttpError(400, "invalid_limit", "limit must be an integer");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new HttpError(400, "invalid_limit", `limit must be between 1 and ${MAX_LIMIT}`);
  }
  return parsed;
}

function resolveOffset(cursor: string | undefined, query: string): number {
  try {
    return resolveCatalogCursor(cursor, query).offset;
  } catch (error) {
    if (error instanceof CursorError) throw new HttpError(400, "invalid_cursor", error.message);
    throw error;
  }
}

export function searchWineCatalog(
  catalog: readonly WineSummary[],
  queryValue: string | undefined,
  cursor: string | undefined,
  limit: number,
): CatalogResponse<WineSummary> {
  const query = normalized(queryValue ?? "");
  const offset = resolveOffset(cursor, query);
  const matches =
    query.length === 0
      ? catalog
      : catalog.filter((wine) =>
          [
            wine.name,
            wine.productNumber,
            wine.country ?? "",
            wine.wineCategory ?? "",
            wine.assortment ?? "",
            ...(wine.assortmentGrades ?? []),
          ]
            .map(normalized)
            .some((value) => value.includes(query)),
        );
  const items = matches.slice(offset, offset + limit);
  return {
    items,
    nextCursor: nextCatalogCursor(
      offset,
      items.length,
      offset + items.length < matches.length,
      query,
    ),
  };
}

export function searchMonopolyCatalog(
  catalog: readonly MonopolySummary[],
  queryValue: string | undefined,
  cursor: string | undefined,
  limit: number,
): CatalogResponse<MonopolySummary> {
  const query = normalized(queryValue ?? "");
  const offset = resolveOffset(cursor, query);
  const matches =
    query.length === 0
      ? catalog
      : catalog.filter((monopoly) =>
          [
            monopoly.name,
            monopoly.storeNumber,
            monopoly.postalCode ?? "",
            monopoly.city ?? "",
            monopoly.monopolyCategory ?? "",
            monopoly.monopolyProfile ?? "",
            monopoly.storeAssortment ?? "",
          ]
            .map(normalized)
            .some((value) => value.includes(query)),
        );
  const items = matches.slice(offset, offset + limit);
  return {
    items,
    nextCursor: nextCatalogCursor(
      offset,
      items.length,
      offset + items.length < matches.length,
      query,
    ),
  };
}
