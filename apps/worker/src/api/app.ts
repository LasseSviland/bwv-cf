import { Hono } from "hono";

import { QueryPeriodError, validateQueryPeriod } from "@bwv/data-format";

import { HttpError } from "../errors";
import {
  getMonopolyCatalog,
  getMonopolyDetail,
  getSearchableWineCatalog,
  getWineCatalog,
  getWineDetail,
} from "../ingestion/catalogs";
import { enqueueManual } from "../ingestion/enqueue";
import { logError } from "../log";
import { MONOPOLIES_KEY, WINES_KEY } from "../storage/keys";
import { objectExists } from "../storage/r2";
import { verifyBearerAuthorization } from "./auth";
import {
  parseCatalogLimit,
  parseEntityId,
  searchMonopolyCatalog,
  searchWineCatalog,
} from "./catalog";
import { errorResponse, jsonWithEtag } from "./http";
import { assembleMonopolyInventory, assembleWineInventory } from "./inventory";
import { getStatus } from "./status";
import { getStatistics } from "./statistics";
import { summarizeMonopolies, summarizeWines } from "./summaries";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

const app = new Hono<AppBindings>();

function requestIdFor(request: Request): string {
  return request.headers.get("cf-ray") ?? crypto.randomUUID();
}

function periodFromUrl(url: string) {
  const search = new URL(url).searchParams;
  try {
    return validateQueryPeriod({ from: search.get("from"), to: search.get("to") });
  } catch (error) {
    if (error instanceof QueryPeriodError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }
}

app.use("*", async (context, next) => {
  const requestId = requestIdFor(context.req.raw);
  context.set("requestId", requestId);
  await next();
  context.res.headers.set("x-request-id", requestId);
  context.res.headers.set("x-content-type-options", "nosniff");
  context.res.headers.set("referrer-policy", "same-origin");
});

app.use("/api/v1/*", async (context, next) => {
  const valid = await verifyBearerAuthorization(
    context.req.header("authorization") ?? null,
    context.env.API_KEY,
  );
  if (!valid) {
    const response = errorResponse(
      401,
      "unauthorized",
      "A valid bearer credential is required",
      context.get("requestId"),
    );
    response.headers.set("www-authenticate", "Bearer");
    return response;
  }
  await next();
});

app.get("/api/v1/health", async (context) => {
  const [wines, monopolies] = await Promise.all([
    objectExists(context.env, WINES_KEY),
    objectExists(context.env, MONOPOLIES_KEY),
  ]);
  return context.json({
    status: "ok",
    catalogsReady: wines && monopolies,
    requestId: context.get("requestId"),
  });
});

app.get("/api/v1/status", async (context) => {
  const status = await getStatus(context.env);
  return jsonWithEtag(context.req.raw, status, `status:${JSON.stringify(status)}`);
});

app.get("/api/v1/statistics", async (context) => {
  const result = await getStatistics(context.env, periodFromUrl(context.req.url));
  return jsonWithEtag(context.req.raw, result.response, result.etagSeed);
});

app.get("/api/v1/wines", async (context) => {
  const query = context.req.query("query");
  const includeOutdated = context.req.query("includeOutdated") === "true";
  const catalog =
    query?.trim() || includeOutdated
      ? await getSearchableWineCatalog(context.env)
      : await getWineCatalog(context.env);
  const catalogPage = searchWineCatalog(
    catalog,
    query,
    context.req.query("cursor"),
    parseCatalogLimit(context.req.query("limit")),
  );
  const period = periodFromUrl(context.req.url);
  const response = {
    ...catalogPage,
    items: await summarizeWines(context.env, catalogPage.items, period),
  };
  return jsonWithEtag(context.req.raw, response, `wines:${JSON.stringify(response)}`);
});

app.get("/api/v1/wines/:wineId/inventory", async (context) => {
  const wineId = parseEntityId(context.req.param("wineId"));
  const result = await assembleWineInventory(context.env, wineId, periodFromUrl(context.req.url));
  return jsonWithEtag(context.req.raw, result.response, result.etagSeed);
});

app.get("/api/v1/wines/:wineId", async (context) => {
  const wineId = parseEntityId(context.req.param("wineId"));
  const wine = await getWineDetail(context.env, wineId);
  if (wine === null) throw new HttpError(404, "wine_not_found", "Wine was not found");
  return jsonWithEtag(context.req.raw, wine, `wine-detail:${JSON.stringify(wine)}`);
});

app.get("/api/v1/monopolies", async (context) => {
  const catalog = await getMonopolyCatalog(context.env);
  const catalogPage = searchMonopolyCatalog(
    catalog,
    context.req.query("query"),
    context.req.query("cursor"),
    parseCatalogLimit(context.req.query("limit")),
  );
  const period = periodFromUrl(context.req.url);
  const response = {
    ...catalogPage,
    items: await summarizeMonopolies(context.env, catalogPage.items, period),
  };
  return jsonWithEtag(context.req.raw, response, `monopolies:${JSON.stringify(response)}`);
});

app.get("/api/v1/monopolies/:monopolyId/inventory", async (context) => {
  const monopolyId = parseEntityId(context.req.param("monopolyId"));
  const result = await assembleMonopolyInventory(
    context.env,
    monopolyId,
    periodFromUrl(context.req.url),
  );
  return jsonWithEtag(context.req.raw, result.response, result.etagSeed);
});

app.get("/api/v1/monopolies/:monopolyId", async (context) => {
  const monopolyId = parseEntityId(context.req.param("monopolyId"));
  const monopoly = await getMonopolyDetail(context.env, monopolyId);
  if (monopoly === null) {
    throw new HttpError(404, "monopoly_not_found", "Monopoly was not found");
  }
  return jsonWithEtag(context.req.raw, monopoly, `monopoly-detail:${JSON.stringify(monopoly)}`);
});

app.post("/api/v1/admin/sync-inventories", async (context) => {
  return context.json(await enqueueManual(context.env), 202);
});

app.notFound((context) =>
  errorResponse(404, "not_found", "API route was not found", context.get("requestId")),
);

app.onError((error, context) => {
  const requestId = context.get("requestId") || crypto.randomUUID();
  if (error instanceof HttpError) {
    return errorResponse(error.status, error.code, error.message, requestId);
  }
  logError("Unhandled API error", {
    requestId,
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    error: error instanceof Error ? error.message : String(error),
  });
  return errorResponse(500, "internal_error", "Internal server error", requestId);
});

export default app;
