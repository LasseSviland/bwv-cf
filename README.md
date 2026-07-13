# Better Wines, Viner

Password-protected inventory history for Norwegian Vinmonopolet stores, deployed as one Cloudflare Worker at [bwv.sviland.net](https://bwv.sviland.net).

The Worker serves a React SPA and `/api/v1` API from the edge. Wines, monopolies, catalog versions, and operational state live in D1. R2 contains only inventory data: short-lived extraction chunks plus one published gzip JSON snapshot for every covered date. User-facing requests never query MySQL. A six-hour Cron Trigger queues sequential Hyperdrive ingestion for the current and previous Oslo months, and historical loading starts at January 2026.

The inventory views distinguish three states: positive morning stock, sold out within known source coverage, and unavailable when a day or month has not been published yet.

The UI defaults to the latest 30 Oslo calendar days and offers the latest two months, year to date, and custom date ranges. The wine catalog is limited to rows owned by Better Wines (`grossist = "Better Wines AS"`).

## Repository layout

```text
apps/worker/       Worker API, Cron producer, Queue consumer, ingestion
apps/web/          Responsive React application
packages/contracts Shared API and Queue schemas
packages/data-format Date, sparse-series, and dataset helpers
migrations/        D1 operational-state migrations
docs/              API and operations handbooks
```

## Local development

Requirements: Node.js 22+, pnpm 10+, and Wrangler 4.x.

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm types
pnpm check
pnpm build
pnpm dev
```

For local ingestion, set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` outside source control to a TLS-enabled, SELECT-only MySQL connection string. Browser development can run separately with `pnpm dev:web`; Vite proxies `/api` to the local Worker.

To run only the frontend locally against the production API, use:

```bash
pnpm dev:web:remote-api
```

This uses the checked-in `remote-api` Vite mode to proxy `/api` to `https://bwv.sviland.net`, so no local Worker or CORS configuration is needed. The frontend still prompts for the API password; do not put it in an environment file.

## Production resources

- Worker: `better-wines-viner`
- D1: `better-wines-viner-state`
- R2: `better-wines-viner-data`
- Queue: `better-wines-viner-sync`
- DLQ: `better-wines-viner-sync-dlq`
- Hyperdrive: `better-wines-viner-mysql`
- Cron: `0 */6 * * *`
- Host: `bwv.sviland.net`

`API_KEY` is a Worker secret. It is never stored in this repository or compiled into the frontend. Production database access uses a dedicated account with `SELECT` only on `inventories`, `wines`, `monopolies`, and `post_codes`, with RDS certificate verification enabled.

## Deployment

Pull requests and branches run formatting, linting, strict TypeScript checks, tests, generated-binding checks, and the production frontend build. Pushes to `main` repeat those checks, apply D1 migrations, deploy through Wrangler, then call the authenticated reload endpoint. Reload clears D1 application data and every R2 object before importing catalogs and inventory from MySQL for `2026-01` through the current Oslo month.

GitHub Actions requires repository secrets named `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `BWV_API_KEY`. `BWV_API_KEY` must contain the same value as the Worker's `API_KEY` secret so deployment can start the reload. The Cloudflare API token should be scoped only to the Worker and Better Wines resources. See [Operations](docs/OPERATIONS.md) for reload, verification, replay, and rollback.
