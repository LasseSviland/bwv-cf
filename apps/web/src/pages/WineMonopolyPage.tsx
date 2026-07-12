import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { DailyInventory, MonopolySummary } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
import { FreshnessBanner } from "../components/FreshnessBanner";
import { InventoryCalendar } from "../components/InventoryCalendar";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import {
  availableDates,
  enumerateDates,
  isInventoryDateAvailable,
  latestCount,
  stockDays,
} from "../utils/dates";

interface FocusedInventory {
  response: Awaited<ReturnType<typeof api.getWineInventory>>;
  monopoly: MonopolySummary;
  inventory: DailyInventory[];
}

export const WineMonopolyPage = () => {
  const { wineId = "", monopolyId = "" } = useParams();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const request = useApiQuery<FocusedInventory>(
    `wine-monopoly:${wineId}:${monopolyId}:${period.from}:${period.to}`,
    async (apiKey, signal) => {
      const response = await api.getWineInventory(apiKey, wineId, period, signal);
      const matching = response.monopolies.find(
        ({ monopoly }) => String(monopoly.id) === String(monopolyId),
      );
      if (matching) return { response, monopoly: matching.monopoly, inventory: matching.inventory };

      const monopoly = await api.getMonopoly(apiKey, monopolyId, signal);
      return { response, monopoly, inventory: [] };
    },
  );

  if (request.loading && !request.data) return <LoadingState label="Loading daily calendar…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { response, monopoly, inventory } = request.data;
  const wine = response.wine;
  const latestDayAvailable = isInventoryDateAvailable(response.period.to, response);
  const currentCount = latestCount(inventory, response.period.to);
  const availableDays = stockDays(inventory);
  const selectedDayCount = enumerateDates(response.period.from, response.period.to).length;
  const knownDayCount = availableDates(response.period.from, response.period.to, response).length;
  const unavailableDayCount = selectedDayCount - knownDayCount;
  const soldOutDayCount = Math.max(knownDayCount - availableDays, 0);

  return (
    <div className="page-stack">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/wines">Wines</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/wines/${wine.id}?from=${period.from}&to=${period.to}`}>{wine.name}</Link>
        <span aria-hidden="true">/</span>
        <span>{monopoly.name}</span>
      </nav>
      <PageHeader
        eyebrow={`Product ${wine.productNumber} · Store ${monopoly.storeNumber}`}
        title={`${wine.name} at ${monopoly.name}`}
        description="A focused day-by-day view of morning inventory at this monopoly."
        actions={
          <span
            className={
              !latestDayAvailable
                ? "status-pill status-pill--neutral"
                : currentCount > 0
                  ? "status-pill status-pill--in"
                  : "status-pill status-pill--out"
            }
          >
            Latest day:{" "}
            {latestDayAvailable
              ? currentCount > 0
                ? `${currentCount} in stock`
                : "Sold out"
              : "Data unavailable"}
          </span>
        }
      />

      <FreshnessBanner freshness={response} periodThrough={response.period.to} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <section className="metric-grid" aria-label="Wine and store summary">
        <div className="metric-card metric-card--accent">
          <span>Days in stock</span>
          <strong>{availableDays}</strong>
          <small>Within the selected period</small>
        </div>
        <div className="metric-card">
          <span>Days sold out</span>
          <strong>{soldOutDayCount}</strong>
          <small>Only days covered by published data</small>
        </div>
        <div className="metric-card">
          <span>Days unavailable</span>
          <strong>{unavailableDayCount}</strong>
          <small>Not published or beyond source coverage</small>
        </div>
      </section>

      {inventory.length === 0 && knownDayCount > 0 ? (
        <EmptyState
          title="No in-stock days in this period"
          description="This store did not report positive stock for this wine, so each selected day is shown as sold out."
        />
      ) : null}
      <InventoryCalendar
        inventory={inventory}
        from={response.period.from}
        to={response.period.to}
        freshness={response}
      />
    </div>
  );
};
