# Better Wines, Viner

Password-protected inventory history for Norwegian Vinmonopolet stores, deployed as one Cloudflare Worker at [bwv.sviland.net](https://bwv.sviland.net).

The Worker serves the React SPA, the `/api/v1` API, a daily Cron producer, and a single-concurrency Queue consumer. Vinmonopolet is the source of truth. Every sync fetches the complete Better Wines catalog and store catalog, merges both with the prior R2 copies, and fetches the complete stock response when that day's inventory file does not already exist.

All source records are retained as raw JSON so newly added API fields are not discarded. Current records replace changed values while the deep merge preserves fields omitted by a later response. Records removed from the API remain in the catalogs.

## R2 layout

```text
catalogs/wines.json          Complete merged Better Wines catalog
catalogs/monopolies.json     Complete merged Vinmonopolet store catalog
inventory/YYYY-MM-DD.json    One complete stock-per-store response per Oslo day
```

There is no database dependency in this version. Migrating historical data from the old database is intentionally deferred until the file-based sync is proven in production.

## Repository layout

```text
apps/worker/       Worker API, Cron producer, Queue consumer, and R2 ingestion
apps/web/          Responsive React application and Settings sync control
packages/contracts Shared API and Queue schemas
packages/data-format Date and sparse-series helpers
docs/              API and operations handbooks
old-app/           Local reference clone; not part of this application or deployment
```

## Local development

Requirements: Node.js 22+, pnpm 10+, and Wrangler 4.x.

```bash
pnpm install
pnpm types
pnpm check
pnpm dev
```

`API_KEY`, `VINMONOPOLET_OPEN_API_KEY`, and `VINMONOPOLET_RESTRICTED_API_KEY` are deployment-owned variables in `wrangler.jsonc`, so local Worker development and production deployments use the same checked-in values. Browser development can run separately with `pnpm dev:web`; Vite proxies `/api` to the local Worker.

To run only the frontend locally against the production API, use:

```bash
pnpm dev:web:remote-api
```

This uses the checked-in `remote-api` Vite mode to proxy `/api` to `https://bwv.sviland.net`. The frontend still prompts for the API password; do not put it in a frontend environment file.

## Production resources

- Worker: `better-wines-viner`
- R2: `better-wines-viner-data`
- Queue: `better-wines-viner-sync`
- DLQ: `better-wines-viner-sync-dlq`
- Cron: `15 7 * * *` (07:15 UTC; 08:15 Oslo in winter and 09:15 in summer)
- Host: `bwv.sviland.net`

The Queue accepts batches of one and has a maximum concurrency of one. A Cron invocation or the Settings button enqueues exactly one `start-sync` message. The consumer runs the three source operations sequentially in that message.

`API_KEY`, `VINMONOPOLET_OPEN_API_KEY`, and `VINMONOPOLET_RESTRICTED_API_KEY` are checked-in Worker variables in `wrangler.jsonc`. Wrangler publishes them with every deployment, so the Worker does not depend on separately configured Cloudflare secrets. They are runtime bindings and are not compiled into the frontend bundle.

## Deployment

Pull requests and branches run formatting, linting, strict TypeScript checks, tests, generated-binding checks, and the production frontend build. Pushes to `main` repeat those checks and deploy through Wrangler. Deployments do not delete or rebuild R2 data.

GitHub Actions requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The Cloudflare API token should be scoped only to the Worker and Better Wines resources. See [Operations](docs/OPERATIONS.md) for manual sync, recovery, runtime-variable rotation, and rollback.
