# Better Wines API

All endpoints are under `/api/v1` and require `Authorization: Bearer <API_KEY>`. Credentials are never accepted in a URL. JSON errors contain a stable error code, a safe message, and a request ID.

## Read endpoints

- `GET /status` — published month coverage and freshness.
- `GET /health` — binding/process health without contacting MySQL.
- `GET /wines?query=&cursor=&limit=` — wine catalog search.
- `GET /wines/:wineId` — wine metadata.
- `GET /wines/:wineId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — daily stock for every store that stocked the wine during the period.
- `GET /monopolies?query=&cursor=&limit=` — Vinmonopolet store search.
- `GET /monopolies/:monopolyId` — store metadata.
- `GET /monopolies/:monopolyId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — one bulk response containing every stocked wine and its daily series.

Missing source observations inside published coverage are returned as `count: 0` and mean sold out. Positive counts mean in stock. Dates after `coveredThrough` and dates in `missingMonths` are not observations; clients must present them as unavailable rather than sold out. Dates use `YYYY-MM-DD` and product boundaries use `Europe/Oslo`. If dates are omitted, the period starts on the first day of the previous month and ends today.

## Operations endpoints

- `POST /admin/refresh` — queue the current and previous Oslo months.
- `POST /admin/sync` with `{ "months": ["YYYY-MM"] }` — queue one or more explicit months.
- `POST /admin/backfill` with optional `{ "fromMonth": "2024-01", "throughMonth": "YYYY-MM" }` — discover bounds once and queue one explicit month message for every month in the range.
- `GET /admin/jobs?limit=` — recent parent runs.
- `GET /admin/jobs/:jobId` — parent run and per-month phase/status details.

Mutation endpoints return `202 Accepted`; MySQL work is performed only by the Queue consumer. Duplicate active requests are coalesced.
