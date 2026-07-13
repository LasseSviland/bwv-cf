# File-based synchronization plan

## Objective

Replace the cloned database loader with a Cloudflare-native synchronization pipeline using one Worker, one Queue, and R2. Vinmonopolet API responses remain available without reducing them to the old database schema.

## Execution model

1. The daily `0 6 * * *` Cron Trigger enqueues one `start-sync` message at 08:00 CEST.
2. The Queue consumer processes one message at a time and allows only one concurrent consumer.
3. It fetches all Better Wines products from `GET /my-products/v1/details-normal` without query parameters.
4. It reads `catalogs/wines.json`, deep-merges the current records by `basic.productId`, records the first Oslo detection date for retained products missing from the current response, and writes the complete merged catalog.
5. It fetches all stores from `GET /stores/v0/details` without query parameters.
6. It reads `catalogs/monopolies.json`, deep-merges the current records by `storeId`, and writes the complete merged catalog.
7. It checks `inventory/YYYY-MM-DD.json` for the current Oslo day. If the object exists, inventory synchronization stops successfully. Otherwise it fetches `GET /my-products/v1/stock-per-store` without query parameters and writes the complete response to that single daily object.

The Settings page queues exactly the same message, allowing the daily operation to be started manually. Repeated messages are safe: catalogs are merged again and the daily inventory object prevents duplicate stock requests and writes.

## Merge rules

- Preserve every raw field returned by Vinmonopolet.
- Add records that appear for the first time.
- Update existing records from the newest API response.
- Recursively preserve old nested fields when a newer object omits them.
- Keep wine records no longer returned by My Products, mark them in `outdatedProducts`, and retain the first detection date until they reappear.
- Exclude outdated wines from the active catalog, store inventory, and statistics while retaining explicit search, product-detail, and historical inventory access.
- Keep stores no longer returned by the API available in the merged store catalog.
- Reject an unexpectedly empty Better Wines response rather than overwriting the catalog with an invalid sync.

## R2 data model

```text
catalogs/wines.json
catalogs/monopolies.json
inventory/YYYY-MM-DD.json
```

Catalog wrappers include the schema version, update timestamp, and merged raw record array. The version-2 wine wrapper also includes `outdatedProducts`, a product-number-to-date map. Inventory wrappers include the schema version, Oslo date, capture timestamp, and raw full stock response.

The read API derives its searchable catalog summaries and inventory matrices from these files. A missing daily inventory file means unavailable coverage; a missing product/store observation inside an available daily file means zero stock.

## Operational guarantees

- One Queue and one queue message shape for scheduled and manual work.
- One-message batches and maximum consumer concurrency of one.
- Sequential Vinmonopolet requests, with transient Queue retries and a DLQ.
- Deterministic R2 keys and create-only inventory writes make redelivery idempotent.
- Authentication is required for every `/api/v1` endpoint, including manual sync.
- Application keys are checked-in Worker variables and are published by every deployment.

## Out of scope

- Running the local historical migration as part of Worker deployment or daily synchronization. The separate two-phase tool is documented in `migration/README.md`.
- Writing to or maintaining the old database.
- One inventory object or Queue message per wine.
- Destructive reloads during deployment.
