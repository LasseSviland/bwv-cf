# Operations

## Initial release

1. Install dependencies, generate bindings, and run `pnpm check`.
2. Create the R2 bucket, Queue, and DLQ named in `wrangler.jsonc` if they do not already exist.
3. Review the checked-in `API_KEY`, `VINMONOPOLET_OPEN_API_KEY`, and `VINMONOPOLET_RESTRICTED_API_KEY` variables in `wrangler.jsonc`.
4. Build and deploy to `better-wines-viner.sviland.workers.dev` without the production route. Wrangler publishes all three variables as part of the deployment.
5. Verify the SPA password gate plus authenticated `/api/v1/health` and `/api/v1/status` responses.
6. Open Settings and select **Sync inventories now**.
7. Verify `catalogs/wines.json`, `catalogs/monopolies.json`, and the current `inventory/YYYY-MM-DD.json` in R2.
8. Reconcile sampled products, stores, and stock with the Vinmonopolet responses.
9. Add the reversible `bwv.sviland.net/*` Worker route and repeat desktop and mobile smoke tests.

No historical database migration or destructive R2 reload belongs to the initial release.

## Daily sync

The `15 7 * * *` Cron Trigger fires at 07:15 UTC and enqueues exactly one `start-sync` message. The same message is sent by the Settings button. The Queue consumer has a batch size of one and maximum concurrency of one.

The consumer performs these steps sequentially:

1. Fetch and merge the complete Better Wines product catalog.
2. Fetch and merge the complete Vinmonopolet store catalog.
3. If today's daily inventory object is absent, fetch all stock and write one object for the entire response.

Catalog records are keyed by product or store ID. New data wins, nested fields omitted by the new response are retained, and source records that disappear remain in the catalog. The inventory object uses a conditional create, so duplicate Queue delivery cannot overwrite an already captured day.

## Manual regeneration

The normal manual operation is the Settings button or:

```bash
curl --fail --request POST \
  --header "Authorization: Bearer $API_KEY" \
  https://bwv.sviland.net/api/v1/admin/sync-inventories
```

To regenerate a day's inventory, delete only `inventory/YYYY-MM-DD.json`, then trigger the sync. Wines and stores are fetched and merged on every invocation regardless of whether the daily inventory object exists.

Deleting `catalogs/wines.json` or `catalogs/monopolies.json` and triggering a sync reconstructs that catalog from the current API response. Because deleted source records can only be retained by merging with the prior file, deleting a catalog intentionally discards that retained history.

## Failures and recovery

- Inspect structured Worker logs by date, trigger, and phase.
- Invalid or permanent API failures are acknowledged and logged; transient failures retry and eventually move to `better-wines-viner-sync-dlq`.
- A failed product or store fetch leaves the previous catalog object intact.
- A failed stock fetch leaves the day absent, so a later scheduled or manual message can retry it.
- After correcting a dependency, use the Settings button to replay the complete operation.
- If the DLQ contains a message, retry by triggering a fresh sync after the cause is fixed.

## Runtime variables and rotation

- The three application keys are intentionally committed under `vars` in `wrangler.jsonc` and replaced on every deployment.
- Rotate `API_KEY` by changing the checked-in value and deploying, then sign in again in the SPA.
- Rotate either Vinmonopolet subscription key by changing its checked-in value, deploying, verifying a manual sync, and then revoking the previous key.
- Keep the GitHub `CLOUDFLARE_API_TOKEN` scoped to the resources required for deployment.

## Rollback

Use `wrangler versions list` and `wrangler rollback <VERSION_ID>` for Worker code. A Worker rollback does not modify R2. Removing the `bwv.sviland.net/*` route immediately restores the prior origin without changing its DNS record.
