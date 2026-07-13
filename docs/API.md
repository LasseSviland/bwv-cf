# Better Wines API

All endpoints are under `/api/v1` and require `Authorization: Bearer <API_KEY>`. Credentials are never accepted in a URL. JSON errors contain a stable error code, a safe message, and a request ID.

## Read endpoints

- `GET /status` — published month coverage and freshness.
- `GET /health` — binding/process health without contacting MySQL.
- `GET /wines?query=&cursor=&limit=&from=&to=` — Better Wines catalog search with `wineCategory`, per-wine relation counts, and the total number of bottles across monopolies for every covered date.
- `GET /wines/:wineId` — wine metadata, including `wineCategory` when the source provides it.
- `GET /wines/:wineId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — daily stock for every store that stocked the wine during the period.
- `GET /monopolies?query=&cursor=&limit=&from=&to=` — Vinmonopolet search with `monopolyCategory`, per-store relation counts, and the total number of Better Wines bottles for every covered date.
- `GET /monopolies/:monopolyId` — store metadata, including `monopolyCategory` when the source provides it.
- `GET /monopolies/:monopolyId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — one bulk response containing every stocked wine and its daily series.

Missing source observations inside published coverage are returned as `count: 0` and mean sold out. Positive counts mean in stock. Dates after `coveredThrough` and dates in `missingMonths` are not observations; clients must present them as unavailable rather than sold out. Dates use `YYYY-MM-DD` and product boundaries use `Europe/Oslo`. If dates are omitted, the inclusive period is the latest 30 Oslo calendar days.

The D1 wine catalog is restricted at ingestion to source rows where `grossist = "Better Wines AS"`. Inventory for wines outside that catalog is excluded from the published daily snapshots.

The browser can be opened with `?apiKey=<API_KEY>`. This is a frontend bootstrap parameter only: the SPA immediately moves the value into local storage, removes it from the address bar, and continues to send credentials exclusively in the `Authorization` header. API routes never accept query-string credentials.

## Operations endpoints

- `POST /admin/refresh` — queue the current and previous Oslo months.
- `POST /admin/sync` with `{ "months": ["YYYY-MM"] }` — queue one or more explicit months.
- `POST /admin/backfill` with optional `{ "fromMonth": "2026-01", "throughMonth": "YYYY-MM" }` — discover bounds once and queue one explicit month message for every month in the range. Dates before January 2026 are rejected.
- `POST /admin/reload` — destructively clear D1 application data and all R2 data, then reload catalogs and inventory from MySQL for January 2026 through the current Oslo month. Production deployment invokes this automatically.
- `GET /admin/jobs?limit=` — recent parent runs.
- `GET /admin/jobs/:jobId` — parent run and per-month phase/status details.

Mutation endpoints return `202 Accepted`; MySQL work is performed only by the Queue consumer. Duplicate active requests are coalesced.
