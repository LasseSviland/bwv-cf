# Better Wines, Viner

Password-protected inventory history for Norwegian Vinmonopolet stores, deployed as one Cloudflare Worker at [bwv.sviland.net](https://bwv.sviland.net).

The Worker serves a React SPA and `/api/v1` API from the edge. User-facing requests read published monthly datasets from R2 and operational pointers from D1; they never query the source MySQL database. A six-hour Cron Trigger queues sequential Hyperdrive ingestion for the current and previous Oslo months. The authenticated backfill API queues every historical month from January 2024 through the current month.

The inventory views distinguish three states: positive morning stock, sold out within known source coverage, and unavailable when a day or month has not been published yet.

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

Pull requests and branches run formatting, linting, strict TypeScript checks, tests, generated-binding checks, and the production frontend build. Pushes to `main` repeat those checks, apply D1 migrations, and deploy through Wrangler.

GitHub Actions requires repository secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API token should be scoped only to the Worker and Better Wines resources. See [Operations](docs/OPERATIONS.md) for initial backfill, verification, replay, and rollback.
