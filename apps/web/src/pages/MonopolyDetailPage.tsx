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

export const MonopolyDetailPage = () => {
  const { monopolyId = "" } = useParams();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [filter, setFilter] = useState("");
  const request = useApiQuery(
    `monopoly:${monopolyId}:${period.from}:${period.to}`,
    (apiKey, signal) => api.getMonopolyInventory(apiKey, monopolyId, period, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    if (!request.data) return [];
    const query = filter.trim().toLocaleLowerCase();
    const sortDate =
      latestAvailableDate(request.data.period.from, request.data.period.to, request.data) ??
      request.data.period.to;
    return request.data.wines
      .filter(({ wine }) =>
        query
          ? [wine.name, wine.productNumber, wine.country]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((left, right) => {
        const stockDifference =
          latestCount(right.inventory, sortDate) - latestCount(left.inventory, sortDate);
        return stockDifference || left.wine.name.localeCompare(right.wine.name);
      })
      .map(({ wine, inventory }) => ({
        id: String(wine.id),
        label: wine.name,
        secondary: [`Product ${wine.productNumber}`, wine.country].filter(Boolean).join(" · "),
        inventory,
        href: `/wines/${wine.id}/monopolies/${monopolyId}?from=${period.from}&to=${period.to}`,
      }));
  }, [filter, monopolyId, period.from, period.to, request.data]);

  if (request.loading && !request.data) return <LoadingState label="Loading monopoly inventory…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { monopoly } = request.data;
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    freshness,
  );
  const winesInStock = latestDate
    ? request.data.wines.filter(({ inventory }) => latestCount(inventory, latestDate) > 0).length
    : null;
  const totalStockDays = request.data.wines.reduce(
    (total, entry) => total + stockDays(entry.inventory),
    0,
  );
  const location = [monopoly.postalCode, monopoly.city].filter(Boolean).join(" ");

  return (
    <div className="page-stack page-stack--wide">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/monopolies">Monopolies</Link>
        <span aria-hidden="true">/</span>
        <span>{monopoly.name}</span>
      </nav>
      <PageHeader
        eyebrow={`Store ${monopoly.storeNumber}`}
        title={monopoly.name}
        description={[location, "Daily inventory by wine"].filter(Boolean).join(" · ")}
        actions={<span className="entity-badge entity-badge--store">Monopoly history</span>}
      />

      <FreshnessBanner freshness={freshness} periodThrough={request.data.period.to} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <section className="metric-grid" aria-label="Availability summary">
        <div className="metric-card">
          <span>Wines carried</span>
          <strong>{request.data.wines.length}</strong>
          <small>At least once in this period</small>
        </div>
        <div className="metric-card metric-card--accent">
          <span>In stock on latest available day</span>
          <strong>{winesInStock ?? "—"}</strong>
          <small>{latestDate ? formatDate(latestDate) : "No covered day in this period"}</small>
        </div>
        <div className="metric-card">
          <span>Wine-days in stock</span>
          <strong>{totalStockDays.toLocaleString("en-GB")}</strong>
          <small>Positive morning observations</small>
        </div>
      </section>

      <section className="filter-panel">
        <label htmlFor="wine-filter">Filter wines in this view</label>
        <input
          id="wine-filter"
          type="search"
          placeholder="Wine name or product number"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span>{rows.length} shown</span>
      </section>

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Wine"
        emptyTitle={filter ? "No matching wines" : "No wines were stocked here"}
        emptyDescription={
          filter
            ? "Clear the wine filter or try another product name."
            : "Choose another period to look for earlier or later inventory."
        }
        freshness={freshness}
      />
    </div>
  );
};
