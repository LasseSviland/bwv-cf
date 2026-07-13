# Operations

## Initial release

1. Install dependencies, generate bindings, and run `pnpm check`.
2. Apply D1 migrations with `pnpm d1:migrate:remote`.
3. Build and deploy to `better-wines-viner.sviland.workers.dev` without the production route.
4. Configure `API_KEY` with `wrangler secret put API_KEY`.
5. Verify authenticated health, status, catalog, and SPA password-gate behavior on `workers.dev`.
6. Start the historical load through `POST /api/v1/admin/reload`. The fixed range is `2026-01` through the current Oslo month.
7. Poll `GET /api/v1/admin/jobs/:jobId` and `/api/v1/status` until every expected month is published.
8. Reconcile sampled wine/store counts with the source MySQL snapshots.
9. Add the reversible `bwv.sviland.net/*` Worker route in front of the existing proxied hostname, then repeat desktop and mobile smoke tests.

Each Queue message and continuation contains its `YYYY-MM` month. Queue delivery is at least once; deterministic R2 keys and D1 phase/cursor checkpoints make duplicate delivery harmless. The Queue consumer is deliberately limited to one concurrent, one-message batch and performs sequential MySQL queries.

Extraction uses 5,000-row primary-key pages. This was raised from the initial 1,000-row production burn-in only after hundreds of sequential pages completed without source or query errors; database queries remain single-concurrency.

Raw inventory extraction chunks live under `staging/v1/`. The production R2 bucket has a lifecycle rule named `expire-sync-staging` that removes those temporary objects after seven days. Published inventory lives at `datasets/v1/month=YYYY-MM/generation=.../inventory/YYYY-MM-DD.json.gz`: one gzip JSON file contains every positive Better Wines inventory relation for that date. Wines and monopolies are stored in D1, not R2.

Every production deployment calls `/admin/reload` after smoke testing. The reload clears current D1 application data and all R2 objects before rebuilding from MySQL, so read APIs can return `503 dataset_unavailable` until the new backfill publishes data. GitHub Actions needs `BWV_API_KEY`, matching the Worker's `API_KEY` secret, to authorize this step.

## Routine refresh

The `0 */6 * * *` Cron Trigger queues the current and immediately previous Oslo month. Both are rebuilt from their conservative source-ID floors through a captured ceiling, so inserts, updates, and deletions in the known recent range are reflected. Archived months stay immutable unless explicitly replayed.

Use `POST /api/v1/admin/sync` to replay one month. Use `/admin/refresh` to enqueue the normal two-month set. Active work for the same month is coalesced.

## Failures and recovery

- Inspect structured Worker logs by `jobId`, `month`, and `phase`.
- Transient failures retry with bounded backoff and then move to `better-wines-viner-sync-dlq`.
- A failed generation never replaces `published_months`; readers continue using the prior complete generation.
- Replay the failed month after correcting the dependency. Publication writes every daily gzip object first and changes the D1 month generation pointer last.
- Routine refreshes retain older R2 generations until the next deployment reload clears the bucket. Roll back code with Wrangler; a deployment reload intentionally rebuilds data instead of preserving the old dataset.

An old, low-ID source row whose `date` is later moved into a recent month cannot be discovered cheaply because the legacy database has no date index. If source evidence shows this behavior, run a controlled full reconciliation rather than relying on the recent month floor.

## Secrets and rotation

- Never print, commit, or place `API_KEY` or database credentials in command arguments that are logged.
- Production MySQL credentials live only in Hyperdrive and have table-scoped `SELECT` grants.
- The RDS regional CA is attached to Hyperdrive with identity verification.
- Rotate `API_KEY` interactively with `wrangler secret put API_KEY`, then sign in again in the SPA.
- Rotate the database reader by creating a replacement SELECT-only account, updating Hyperdrive, validating a sync, and only then removing the old reader.

## Rollback

Use `wrangler versions list` and `wrangler rollback <VERSION_ID>` for Worker code. Removing the `bwv.sviland.net/*` route immediately restores the prior origin without changing its DNS record. A Wrangler rollback does not itself run the destructive reload workflow.
