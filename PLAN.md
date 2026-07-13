# Better Wines, Viner — Implementation Plan

## 1. Goal

Build one TypeScript repository containing:

- A Cloudflare Worker that serves an internet-accessible, password-protected read API and the production React SPA.
- A scheduled, queue-driven ingestion pipeline that reads the existing MySQL database using a strictly read-only account.
- Daily gzip inventory snapshots stored in Cloudflare R2 so user-facing API requests never depend on MySQL.
- A simple React frontend for finding a wine or Vinmonopolet store and viewing its inventory history.
- GitHub Actions deployment when changes are pushed to `main`.

The frontend, API, scheduled handler, Queue producer, and Queue consumer are deployed as one Cloudflare Worker project from this repository. The React application remains a statically built, deliberately thin client; it does not contain inventory aggregation logic or connect to storage directly.

The source MySQL database remains owned and written by the existing application. This project must never write to it.

Confirmed project identity:

- Product name: **Better Wines, Viner**
- GitHub repository: `LasseSviland/bwv-cf`
- Cloudflare resource slug: `better-wines-viner`
- Intended production hostname: `bwv.sviland.net`

## 2. Confirmed source data

Only these tables are in scope:

- `inventories`: sparse daily inventory observations with `id`, `date` (`YYYYMMDD` integer), `count`, `wine_id`, and `monopoly_id`.
- `wines`: wine metadata. Use `id` as the internal key, `varenummer` as the product number, and `varenavn` as the display name.
- `monopolies`: store metadata. Use `id` as the internal key, `butikk_id` as the external store number, and `butikknavn` as the display name.
- `post_codes`: optional store location enrichment through `monopolies.post_code_id`.

`counties`, `municipalities`, `scores`, and all other tables are out of scope unless a later product requirement explicitly adds them.

Current observations:

- `inventories` contains approximately 7.7 million rows.
- The inventory date range is `2017-08-05` through `2026-07-12` at the time of planning.
- A missing `(date, wine_id, monopoly_id)` observation means zero stock.
- `inventories.date` is not indexed. Existing inventory indexes cover only the primary key, `wine_id`, and `monopoly_id` separately.

Each inventory date represents the morning inventory snapshot for Norwegian Vinmonopolet stores. Inventory facts are produced by a separate application; this project is a read-only downstream index and presentation layer. The source writer, its schedule, and its database schema are outside this project's ownership and will not be changed.

`counties` is not required for the initial product. If “countries” means wine origin, that value already exists as `wines.land`; if it means Norwegian counties/fylker, adding it later would require the `post_codes` → `municipalities` → `counties` relationship.

## 3. Confirmed decisions and remaining constraints

Confirmed:

- Store wines and monopolies in D1. Store one gzip JSON inventory object per covered calendar date in R2.
- Store and wine APIs return raw inventory observations. They do not calculate distinct-wine totals, total bottle counts, averages, or other summaries; the frontend may derive those values.
- A store endpoint supports one bulk response containing all wines and their inventory series, avoiding hundreds of follow-up requests.
- Archived months remain queryable. Only the current and immediately previous month are rebuilt by the six-hour refresh.
- Production reload covers every calendar month from `2026-01` through the current Oslo month. It clears existing D1 application data and R2 objects before reloading from MySQL.
- Inventory is mostly append-only but rows can be updated or deleted, so a high-watermark-only incremental design is insufficient for correctness.
- The legacy database cannot be changed and no new index can be added.
- Every API endpoint requires an API access password. The frontend prompts for it and treats it as a password; it is never compiled into the static application.
- `counties` is not part of the initial dataset. Location tables are joined only if needed to fill missing store location information.
- The default period remains the first day of the previous month through today in `Europe/Oslo`.

Remaining constraints requiring explicit handling:

1. `bwv.sviland.net` already exists in Cloudflare as a proxied CNAME to `better-wines-load-balancer-1230729848.eu-central-1.elb.amazonaws.com`. Do not replace it until the Worker is deployed and verified on its `workers.dev` hostname, and obtain explicit cutover confirmation immediately before changing the existing DNS/custom-domain routing.
2. With no index on `date` or `updated_at`, there is no cheap query that can discover an old, low-ID row whose `date` is later changed into the current two-month window. The primary-key window strategy below detects new rows, count/foreign-key updates, and deletions inside the known recent ID range. Confirm whether changing an old row's `date` into a recent month is a real behavior; if it is, an occasional full-table reconciliation is unavoidable.

## 4. Recommended architecture

```text
Browser
  ├─ static React assets ────────────────┐
  └─ /api/v1/* ─────────────────────────┤
                                        ▼
                              Cloudflare Worker
                                ├─ Workers Static Assets
                                ├─ R2 daily gzip inventory data
                                └─ D1 catalogs + ingestion state

Cron Trigger (every 6 hours) ──► Queue producer
Manual refresh endpoint ───────► Queue producer
                                        │
                                        ▼
                              Queue consumer (concurrency 1)
                                ├─ Hyperdrive ──► read-only MySQL
                                ├─ D1 job/checkpoint state
                                └─ R2 staged + published objects
```

Use Cloudflare Workers Static Assets for the built React application rather than an R2 bucket. Wrangler deploys the Worker and fingerprinted frontend assets as one versioned unit and Cloudflare caches the assets at the edge. R2 remains dedicated to inventory datasets.

Use Hyperdrive for the external MySQL connection, `mysql2`'s Promise API, TLS, and `nodejs_compat`. Create a dedicated MySQL user restricted to `SELECT` on the four approved tables.

Use D1 for wines, monopolies, catalog-generation state, job locks, checkpoints, published month versions, and audit history. Inventory facts remain in R2.

## 5. Repository structure

```text
/
  apps/
    worker/
      src/
        api/
        ingestion/
        index.ts
      tests/
    web/
      src/
      tests/
  packages/
    contracts/       # Shared request/response schemas and TypeScript types
    data-format/     # Monthly dataset encoder/decoder and zero filling
  migrations/        # D1 operational-state migrations
  scripts/           # Local inspection and maintenance tools
  .github/workflows/
  wrangler.jsonc
  package.json
  PLAN.md
```

Use a pnpm workspace, TypeScript in strict mode, React with Vite, Vitest, ESLint, and Prettier. Generate Worker binding types with `wrangler types`; do not maintain handwritten binding interfaces.

## 6. R2 data model

### One logical monthly generation with one file per date

```text
datasets/v1/month=2026-07/generation={generation}/inventory/2026-07-01.json.gz
datasets/v1/month=2026-07/generation={generation}/inventory/2026-07-02.json.gz
staging/v1/month=2026-07/generation={generation}/raw/{cursor-range}.json
```

Each published object contains the schema version, date, generation, and every sparse positive `(wineId, monopolyId, count)` fact for that date. It is encoded as gzip JSON with `Content-Encoding: gzip`. Catalog metadata is not duplicated into R2; D1 is the only catalog store.

Each calendar month is an independently addressable logical R2 dataset. Every six-hour run republishes both the current month and the immediately previous month. When a month is no longer one of those two, its last successfully reconciled generation becomes immutable and remains available as archived history unless a retention policy is agreed later.

Catalog and detail requests load each requested date at most once and reuse that snapshot for all wine and monopoly calculations. This removes the prior per-entity/per-month R2 fan-out and avoids duplicating observations into two projections.

Publishing must be atomic from the API's perspective:

1. Write every daily gzip object under a unique generation prefix.
2. Validate counts, date bounds, referential integrity, and object count.
3. Update the D1 `published_months` pointer only after all dates exist.
4. Retain the previous generation during routine refreshes and remove all R2 data during the next deployment reload.

## 7. Ingestion pipeline

### Scheduling and enqueueing

- Configure Cron Trigger `0 */6 * * *` (UTC). The scheduled handler only submits an ingestion request to the Queue and exits.
- Configure the same Worker as Queue producer and consumer.
- Set Queue consumer `max_concurrency: 1` and `max_batch_size: 1` to protect the low-capacity database.
- Add a dead-letter queue and bounded retries with backoff.
- `POST /api/v1/admin/refresh` validates the Worker API-key bearer secret using timing-safe comparison, enqueues the same job type, and returns `202 Accepted` with a job ID.
- The manual endpoint only enqueues work; it never opens MySQL or performs ingestion within the HTTP request.
- Coalesce duplicate scheduled/manual requests while a run is queued or active.

### Work partitioning

One queue message should not assume the whole export fits in a single invocation. Use resumable messages:

```json
{
  "version": 1,
  "jobId": "uuid",
  "month": "2026-07",
  "phase": "extract",
  "cursorId": 123456,
  "ceilingId": 8089764
}
```

The consumer processes a bounded number of pages sequentially, persists its checkpoint, and enqueues one continuation message if work remains. It never issues parallel MySQL queries. Queue delivery is at-least-once, so every phase must be idempotent.

### Database reads

- Refresh the current and previous Oslo calendar months every run.
- Capture `MAX(inventories.id)` once at the beginning of a run as its fixed source ceiling.
- Persist a conservative `floorId` for each month when that month is first observed. Rebuild the current two months by scanning from the older month's floor through the captured ceiling.
- Use primary-key keyset pagination, never `OFFSET` and never an unindexed date-range query:

```sql
SELECT id, date, count, wine_id, monopoly_id
FROM inventories
WHERE id > ?
  AND id <= ?
ORDER BY id
LIMIT ?;
```

- Filter the scanned rows to the current and previous months in the consumer. Rebuilding from the saved floor makes updates and deletions inside the scanned recent-ID window visible in the next generation.
- Start conservatively at 500–1,000 rows per page, with one open connection and no query parallelism. The controlled production burn-in completed hundreds of sequential 1,000-row pages without source or query errors, after which the bounded page was raised to 5,000 to reduce Queue and connection overhead. Database reads remain strictly single-concurrency.
- A deployment reload performs one controlled bounds-discovery pass for `2026-01` through the current month, then queues and publishes every month independently. It may take longer than normal refreshes and remains sequential. Each resulting sync and continuation message retains its explicit `YYYY-MM` month.
- Read the small `wines`, `monopolies`, and optional `post_codes` catalogs once per run.
- Join `post_codes` only when it supplies location data not already available on `monopolies`. Do not read `counties` unless a later UI requirement needs county/fylke information.
- Reject or quarantine orphaned foreign keys rather than silently inventing metadata.
- Treat negative inventory counts as invalid. Preserve the latest row for conflict resolution, then omit zero counts from the sparse daily R2 snapshot.
- Use `Europe/Oslo` for product date boundaries and UTC ISO timestamps for system metadata.

### Correctness without source changes

Do not merely append rows above the previous high watermark. Each normal run rescans the known recent primary-key window and reconstructs both mutable months, which detects updates and deletions within that window. Archived months are not rescanned after they close.

Maintain a conservative safety overlap below each stored month floor. Validate that all retained rows fall within the expected two-month range, track unexpected older dates, and fail publication if source behavior invalidates the floor assumption. A rare full-table reconciliation can be scheduled separately if production evidence shows old low-ID rows moving into recent dates.

## 8. API contract

All endpoints are versioned under `/api/v1`. Dates use `YYYY-MM-DD`. Entity IDs are stable database IDs in v1; responses also include external product/store numbers.

### Catalog/search

- `GET /api/v1/wines?query=&cursor=&limit=`
- `GET /api/v1/wines/:wineId`
- `GET /api/v1/monopolies?query=&cursor=&limit=`
- `GET /api/v1/monopolies/:monopolyId`

Search/catalog data comes from D1 and supports the frontend without touching MySQL.

### Inventory history

- `GET /api/v1/wines/:wineId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returns the wine, requested period, and every monopoly that stocked it during the period.
  - For each returned monopoly, returns raw daily counts for the full requested period; missing sparse facts become `count: 0`.
- `GET /api/v1/monopolies/:monopolyId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Bulk endpoint returning the store, requested period, and every wine stocked during the period in one response.
  - For each returned wine, returns raw daily counts for the full requested period; missing sparse facts become `count: 0`.
  - Does not calculate distinct-wine counts, total bottles, or other aggregates.

Default `from` is the first day of the previous month and default `to` is today in Oslo. Validate `from <= to`, reject future dates, set a documented maximum range, and return `400` for invalid parameters.

For every request, derive the covered dates intersecting `[from, to]` and read exactly one R2 gzip object per covered date. Load that set once, reuse it across all requested entities, and then fill missing entity observations with zero.

Zero filling is scoped to the requested entity and dates. Do not materialize the global cross-product of all wines, all stores, and all dates.

Responses include `datasetGeneratedAt`, `sourceWatermark`, and `coveredThrough` so the frontend can display freshness. Use `ETag`, `Cache-Control`, and conditional responses. Return structured error bodies with a request ID and never expose storage keys, SQL, or secrets.

All `/api/v1/*` requests require `Authorization: Bearer <access-password>`. Do not accept credentials in URLs or query parameters. Use constant-time secret comparison and return the same generic `401` response for missing and invalid credentials.

### Operations

- `POST /api/v1/admin/refresh` — enqueue a refresh, protected by secret.
- `GET /api/v1/admin/refresh/:jobId` — optional protected job status.
- `GET /api/v1/health` — process/configuration health only.
- `GET /api/v1/status` — authenticated dataset freshness without touching MySQL.

## 9. Frontend scope

The React SPA is intentionally thin and calls only the password-protected API:

- Password gate shown before data access. Keep the entered API password in memory for the active page session by default, never in the bundle, URL, analytics, or logs. Do not persist it across browser restarts unless a later explicit requirement adds a secure credential flow.
- Home/search page with wine and store search.
- Wine detail page showing which stores carried it and a complete daily stock series for the selected period.
- Store detail page fetching the bulk monopoly response and showing all stocked wines and their raw daily history. Any displayed totals are calculated client-side.
- Shared period picker defaulting to current plus previous month.
- Clear loading, empty, stale-data, partial-data, and error states.
- URL-addressable routes and query parameters so views can be shared.
- Accessible semantic controls, responsive layout, and no secrets or Cloudflare credentials in browser code.

Use the shared contract package for runtime response validation and TypeScript types. Keep business aggregation and zero filling in the API/data-format package rather than duplicating it in React.

## 10. Security and configuration

- Rotate the database password shared during initial exploration before production use.
- Provision a new least-privilege MySQL account with only `SELECT` on the approved tables.
- Put database credentials only in Hyperdrive/Cloudflare secret configuration; never commit them or print them in logs.
- Scope the GitHub Cloudflare API token to only the required account and resources.
- Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.
- Store the read API access password as a Worker secret and require it on every API route. Never embed it in frontend build-time variables.
- Protect manual refresh and backfill endpoints with the same Worker API-key secret used by the frontend, as explicitly required for this deployment, plus job coalescing and bounded Queue retries. Never compile that value into the frontend.
- Restrict CORS to the production origin unless intentional third-party API access is approved.
- Set security headers for the SPA, including CSP, `X-Content-Type-Options`, and an appropriate `Referrer-Policy`.

## 11. Observability and operations

- Enable Workers observability and structured JSON logs.
- Log `jobId`, month, phase, cursor, page size, rows read, elapsed time, generation, and outcome. Never log credentials or complete inventory payloads.
- Record job history and current checkpoint in D1.
- Track queue retries and dead-letter messages.
- Alert on stale `coveredThrough`, failed publication, DLQ growth, unexpected row-count drops, and database query latency.
- Track total refresh duration. The normal target is seconds to a few minutes; establish a concrete warning threshold from the first controlled production runs and treat sustained regressions as an operational failure.
- Expose freshness in `/api/v1/status` and in the frontend.
- Document manual replay, failed-run recovery, generation rollback, secret rotation, and local/remote development.

## 12. Testing and acceptance criteria

### Automated tests

- Unit tests for Oslo month boundaries, query validation, sparse encoding, zero filling, pagination cursors, and idempotency.
- Unit tests for password authorization, primary-key floor/ceiling windows, update/delete reconciliation, and bulk monopoly responses.
- Contract tests for every API response and error shape.
- Ingestion tests against a seeded local MySQL fixture with missing rows, duplicates, orphans, month boundaries, retries, and resumed cursors.
- R2 publication tests proving each published date is one valid gzip JSON object and readers see only a complete D1-published generation.
- Queue tests proving duplicate messages do not duplicate or corrupt output.
- React tests for search, routing, period selection, empty state, and stale-data warnings.
- End-to-end tests against a preview deployment.

### Production acceptance

- No user-facing API request queries MySQL.
- No ingestion invocation performs parallel MySQL queries.
- No ingestion query requires a new source index or database schema change.
- Current and previous months refresh successfully every six hours.
- A normal two-month refresh completes in seconds to a few minutes after the initial floor-discovery backfill; the measured target is documented after production benchmarking.
- Missing observations are returned as zero for every date in a requested entity series.
- API requests read one R2 object per covered date and never fan out by catalog item.
- API results match sampled source SQL for both a wine and a store, including updated and deleted recent rows.
- One authenticated bulk monopoly request can return all wines and raw series needed by the store page without per-wine follow-up requests.
- Every API route rejects missing or invalid access passwords.
- A failed refresh leaves the last successful generation available.
- Pushes to `main` run checks and deploy one Worker plus its static frontend assets.
- Secrets do not appear in Git history, build output, or Worker logs.

## 13. CI/CD

GitHub Actions workflow on pull requests:

1. Install dependencies with a frozen lockfile.
2. Generate/check Worker binding types.
3. Run formatting, lint, TypeScript checks, unit tests, contract tests, and frontend build.
4. Optionally deploy an isolated preview environment after Cloudflare resource strategy is confirmed.

Workflow on `main`:

1. Repeat all checks.
2. Apply D1 migrations using an explicit, reviewed step.
3. Build the React SPA.
4. Deploy the Worker, bindings, Cron Trigger, Queue configuration, and static assets with Wrangler.
5. Run smoke tests against `/api/v1/health`, `/api/v1/status`, and the SPA.
6. Call `/api/v1/admin/reload` to clear current data and reload `2026-01` through the current month from MySQL.

Do not deploy directly from untrusted pull requests with production secrets.

## 14. Delivery phases

1. **Confirm the remaining correctness and cutover constraints:** Resolve whether old rows can have their `date` moved into a recent month and obtain approval to replace the existing `bwv.sviland.net` AWS DNS/custom-domain target only when the Worker is ready.
2. **Connect accounts and repository:** Connect this working directory to the confirmed empty `LasseSviland/bwv-cf` repository without creating a duplicate, and use the already authenticated Cloudflare account for later provisioning.
3. **Bootstrap repository:** Create workspace, Worker, React app, shared contracts, Wrangler configuration, tests, and local environments.
4. **Provision Cloudflare:** Create R2 bucket, Queue and DLQ, D1 database, Hyperdrive configuration, Worker environments, and secrets.
5. **Build ingestion:** Implement D1 catalog reads, keyset pagination, resumable queue state machine, daily gzip snapshots, staged publication, validation, and recovery.
6. **Build API:** Implement search, entity details, targeted multi-month reads, zero filling, cache semantics, validation, and admin refresh.
7. **Build frontend:** Implement search and the two detail experiences using shared contracts.
8. **Harden:** Load-test bulk store responses and R2/API behavior, tune page size and inter-page delay conservatively, verify source impact and refresh duration, add security headers and observability, and rehearse rollback.
9. **Automate deployment:** Add GitHub Actions, preview/production environments, migrations, deployment, and smoke tests.
10. **Launch:** Call the authenticated reload API for every month from `2026-01` through the current month, reconcile samples with MySQL, publish and verify on the Worker hostname, route `bwv.sviland.net` to the verified Worker, monitor the next scheduled runs, and document operations.

## 15. Current Cloudflare references

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Queues configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Queue limits](https://developers.cloudflare.com/queues/platform/limits/)
- [Hyperdrive with MySQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
