# Better Wines API

All endpoints are under `/api/v1` and require `Authorization: Bearer <API_KEY>`. Credentials are never accepted by API routes in a URL. JSON errors contain a stable error code, a safe message, and a request ID.

## Read endpoints

- `GET /status` — R2 catalog counts and available daily inventory coverage.
- `GET /health` — Worker and R2 catalog health without contacting Vinmonopolet.
- `GET /statistics?from=YYYY-MM-DD&to=YYYY-MM-DD` — daily and period-level stockout statistics across the complete portfolio and store network.
- `GET /wines?query=&cursor=&limit=&from=&to=` — active Better Wines catalog with per-wine inventory summaries; a non-empty `query` also searches retained outdated products.
- `GET /wines/:wineId` — wine summary plus the complete stored product record in `sourceData`.
- `GET /wines/:wineId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — daily stock for every store that stocked the wine during the period.
- `GET /monopolies?query=&cursor=&limit=&from=&to=` — Vinmonopolet store search with Better Wines inventory summaries.
- `GET /monopolies/:monopolyId` — store summary plus the complete stored store record in `sourceData`.
- `GET /monopolies/:monopolyId/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD` — one bulk response containing every stocked wine and its daily series.

Missing observations inside an available daily inventory file are returned as `count: 0` and mean sold out for current fixed-assortment products. A date without `inventory/YYYY-MM-DD.json` is unavailable, not sold out. For an outdated product, dates on and after `outdatedAt` are also unavailable for that product and are never interpreted as sold out. Dates use `YYYY-MM-DD`, and default date boundaries use `Europe/Oslo`.

The statistics endpoint counts wine-store placements, so the same wine sold out at five stores counts as five distinct stockouts. A placement is tracked when the wine belongs to the store's fixed assortment or the pair had positive stock during the selected period or its comparison reading. `daily` reports zero-stock placements, distinct affected wines and stores, new positive-to-zero transitions, the last observed bottles before those transitions, and total bottles still in stock. `summary` reports distinct placements, wines, and stores affected; stockout days and placement-days; transition and bottle totals; average daily stockouts; placement availability; and the peak date. `bottlesLostToStockouts` describes inventory movement into zero stock and must not be interpreted as confirmed sales.

The wine catalog contains product records whose `logistics.wholesalerName` is `Better Wines AS`. Its `outdatedProducts` map records the first Oslo date on which a retained product was absent from the current My Products response. Normal catalog reads, status counts, monopoly inventory, and portfolio statistics use only products absent from that map. Explicit search and direct wine detail/history reads include retained products and expose the detection date as `outdatedAt`. The R2 catalog and daily inventory objects retain the complete raw Vinmonopolet records; the API derives the compact UI contracts when reading them.

Wine summaries expose `assortment` and `assortmentGrades`; store summaries expose `monopolyCategory`, `monopolyProfile`, and `storeAssortment`. The statistics API and frontend combine these fields to reserve fixed-assortment stockouts for products assigned to that store. Products from a higher category, a different demand profile, or an optional range are treated as additional local products unless positive stock establishes a tracked placement for the selected period.

Catalog and inventory endpoints deliberately return compact summaries. The two single-entity endpoints expose every JSON field retained from Vinmonopolet and the historical migration under `sourceData`; the frontend loads those larger records only when a user opens “More info”. Empty and null fields remain available through the API even when the UI omits them from the disclosure.

The browser can be opened with `?apiKey=<API_KEY>`. This is a frontend bootstrap parameter only: the SPA immediately moves the value into local storage, removes it from the address bar, and continues to send credentials exclusively in the `Authorization` header.

## Operations endpoint

- `POST /admin/sync-inventories` — enqueue one complete sync for the current Oslo day.

The endpoint takes no request body and returns `202 Accepted`:

```json
{
  "status": "queued",
  "date": "2026-07-13"
}
```

The HTTP request only places one `start-sync` message on the shared Queue. The consumer always fetches and merges wines and stores. It fetches stock only when the current daily inventory object does not already exist.
