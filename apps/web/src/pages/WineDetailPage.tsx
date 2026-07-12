import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Freshness } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { FreshnessBanner } from "../components/FreshnessBanner";
import { InventoryMatrix, type InventoryRow } from "../components/InventoryMatrix";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { formatDate, latestAvailableDate, latestCount, stockDays } from "../utils/dates";

export const WineDetailPage = () => {
  const { wineId = "" } = useParams();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [filter, setFilter] = useState("");
  const request = useApiQuery(`wine:${wineId}:${period.from}:${period.to}`, (apiKey, signal) =>
    api.getWineInventory(apiKey, wineId, period, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    if (!request.data) return [];
    const query = filter.trim().toLocaleLowerCase();
    const sortDate =
      latestAvailableDate(request.data.period.from, request.data.period.to, request.data) ??
      request.data.period.to;
    return request.data.monopolies
      .filter(({ monopoly }) =>
        query
          ? [monopoly.name, monopoly.storeNumber, monopoly.city, monopoly.postalCode]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((left, right) => {
        const stockDifference =
          latestCount(right.inventory, sortDate) - latestCount(left.inventory, sortDate);
        return stockDifference || left.monopoly.name.localeCompare(right.monopoly.name);
      })
      .map(({ monopoly, inventory }) => ({
        id: String(monopoly.id),
        label: monopoly.name,
        secondary: [
          `Store ${monopoly.storeNumber}`,
          [monopoly.postalCode, monopoly.city].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(" · "),
        inventory,
        href: `/wines/${wineId}/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`,
      }));
  }, [filter, period.from, period.to, request.data, wineId]);

  if (request.loading && !request.data) return <LoadingState label="Loading wine availability…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { wine } = request.data;
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    freshness,
  );
  const storesInStock = latestDate
    ? request.data.monopolies.filter(({ inventory }) => latestCount(inventory, latestDate) > 0)
        .length
    : null;
  const totalStockDays = request.data.monopolies.reduce(
    (total, entry) => total + stockDays(entry.inventory),
    0,
  );

  return (
    <div className="page-stack page-stack--wide">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/wines">Wines</Link>
        <span aria-hidden="true">/</span>
        <span>{wine.name}</span>
      </nav>
      <PageHeader
        eyebrow={`Product ${wine.productNumber}`}
        title={wine.name}
        description={
          wine.country
            ? `${wine.country} · Daily inventory by monopoly`
            : "Daily inventory by monopoly"
        }
        actions={<span className="entity-badge entity-badge--wine">Wine history</span>}
      />

      <FreshnessBanner freshness={freshness} periodThrough={request.data.period.to} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <section className="metric-grid" aria-label="Availability summary">
        <div className="metric-card">
          <span>Stores carried it</span>
          <strong>{request.data.monopolies.length}</strong>
          <small>At least once in this period</small>
        </div>
        <div className="metric-card metric-card--accent">
          <span>In stock on latest available day</span>
          <strong>{storesInStock ?? "—"}</strong>
          <small>{latestDate ? formatDate(latestDate) : "No covered day in this period"}</small>
        </div>
        <div className="metric-card">
          <span>Store-days in stock</span>
          <strong>{totalStockDays.toLocaleString("en-GB")}</strong>
          <small>Positive morning observations</small>
        </div>
      </section>

      <section className="filter-panel">
        <label htmlFor="store-filter">Filter stores in this view</label>
        <input
          id="store-filter"
          type="search"
          placeholder="Store name, number or city"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span>{rows.length} shown</span>
      </section>

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Monopoly"
        emptyTitle={filter ? "No matching stores" : "No stores carried this wine"}
        emptyDescription={
          filter
            ? "Clear the store filter or try a different name."
            : "Choose another period to look for earlier or later availability."
        }
        freshness={freshness}
      />
    </div>
  );
};
