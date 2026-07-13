# Historical MySQL migration

This directory performs the one-time migration in two isolated phases. The first phase is read-only against MySQL and leaves a complete local snapshot behind. The second phase works from that snapshot and is the only phase allowed to contact Cloudflare.

## What is migrated

- Every legacy `wines` row owned by `Better Wines AS`.
- Every `monopolies` row.
- Every `inventories` row whose joined wine is owned by `Better Wines AS`.
- The latest inventory row for each date, product number, and store number wins. A latest count of zero is represented by the absence of a positive stock observation, matching the Worker read semantics.

Filtering happens in MySQL, not after a broad inventory download. Both the wine query and the inventory join contain `wines.grossist = 'Better Wines AS'`. The inventory query scans in primary-key order and never sorts on the unindexed `inventories.date` column.

Legacy database primary keys are translated before Cloudflare formatting:

- `inventories.wine_id` -> `wines.varenummer` -> `productId`
- `inventories.monopoly_id` -> `monopolies.butikk_id` -> `storeId`

The complete legacy wine and monopoly rows remain nested under `legacyDatabase` in their catalog records. This retains fields that have no direct equivalent in the current Vinmonopolet response while the normal `basic`, `logistics`, `classification`, `address`, and category fields keep the files readable by the Worker.

## Configuration

Install dependencies from the repository root:

```bash
pnpm install
```

Copy `migration/env.example` to an ignored local environment file and load it in your shell. The MySQL settings can be supplied as one `MIGRATION_DATABASE_URL`, as individual `MIGRATION_DB_*` variables, or with `MIGRATION_LEGACY_PROPERTIES` pointing at the old Spring Boot `application.properties` file.

```bash
cp migration/env.example migration/.env
set -a
source migration/.env
set +a
```

The legacy repository currently keeps those Spring datasource settings at:

```text
bwv-api/src/main/resources/application.properties
```

Do not copy database or R2 credentials into a tracked file.

## Phase 1: download and format locally

```bash
pnpm migration:download
```

The default snapshot directory is `migration/data/export/` and is ignored by Git. Use `--output /absolute/path` to keep the potentially large snapshot on another disk.

The source is exported separately as simple newline-delimited JSON files:

```text
raw/wines.ndjson
raw/monopolies.ndjson
raw/inventories.ndjson
```

After the database connection is closed, the command formats that snapshot into the exact R2 layout used by the Worker:

```text
cloudflare/catalogs/wines.json
cloudflare/catalogs/monopolies.json
cloudflare/inventory/YYYY-MM-DD.json
```

The raw inventory stream checkpoints every 50,000 returned rows. If the database connection is interrupted, rerun with `--resume`; the file is truncated to the last durable checkpoint before the query continues. Use `--force` only when intentionally replacing the local snapshot.

Validate all object checksums and file identities without contacting either MySQL or Cloudflare:

```bash
pnpm migration:validate
```

## Phase 2: upload from local files

Create R2 S3 credentials with Object Read & Write permission scoped only to `better-wines-viner-data`, then load the `CLOUDFLARE_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` variables from the ignored local environment file. The uploader uses Cloudflare's S3-compatible endpoint because it is the high-throughput interface intended for bulk object migration.

Review the remote merge and upload counts without writing:

```bash
pnpm migration:upload -- --dry-run
```

Perform the upload:

```bash
pnpm migration:upload -- --confirm
```

If a local Wrangler OAuth session already has R2 access, the migration can use
that session instead of creating S3 credentials. Supply the authenticated Worker
status URL and API key so existing daily objects can be preserved:

```bash
MIGRATION_STATUS_URL=https://better-wines-viner.sviland.workers.dev/api/v1/status \
MIGRATION_API_KEY=... \
pnpm migration:upload -- --wrangler --dry-run

MIGRATION_STATUS_URL=https://better-wines-viner.sviland.workers.dev/api/v1/status \
MIGRATION_API_KEY=... \
pnpm migration:upload -- --wrangler --confirm
```

The S3-compatible uploader remains the preferred bulk path because it uses
conditional object writes. The Wrangler fallback refreshes both catalogs just
before committing them and skips dates reported by the Worker status endpoint;
run it outside the daily sync window.

The upload behavior is deliberately conservative:

- Existing Cloudflare wine/store catalogs are downloaded and merged locally first.
- Current API fields win for matching records while historic records and omitted legacy fields are retained.
- The merged wine catalog is filtered again to `Better Wines AS`.
- Existing daily inventory objects are skipped, so current Vinmonopolet API snapshots are never replaced by default.
- New inventory objects use `If-None-Match: *` to close races with the daily Worker sync.
- Inventory is uploaded first and the two merged catalogs are committed last.
- Catalog writes use the ETag read before the merge and abort if a daily sync changed a catalog concurrently.

Only use `--overwrite-inventory` after intentionally deciding that legacy database observations should replace already-published daily API files. Upload concurrency defaults to 16 and can be changed with `--concurrency N` (maximum 64).

Every run writes `upload-report.json` into the local snapshot directory. No migration command deletes remote objects.
