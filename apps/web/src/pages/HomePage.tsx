import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { enumerateDates, formatDate } from "../utils/dates";

export const HomePage = () => {
  const { apiKey, status } = useAuth();
  const [searchParams] = useSearchParams();
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const { period, setPeriod } = usePeriodSearch();
  const selectedDays = enumerateDates(period.from, period.to).length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Statistics"
        description="A compact view of the Better Wines portfolio and the selected inventory period."
      />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <section className="overview-stats" aria-label="Portfolio statistics">
        <div>
          <strong>{status?.catalog.wines.toLocaleString("en-GB") ?? "—"}</strong>
          <span>Better Wines products</span>
          <Link to={`/wines?from=${period.from}&to=${period.to}`}>View wines</Link>
        </div>
        <div>
          <strong>{status?.catalog.monopolies.toLocaleString("en-GB") ?? "—"}</strong>
          <span>monopolies tracked</span>
          <Link to={`/monopolies?from=${period.from}&to=${period.to}`}>View monopolies</Link>
        </div>
        <div>
          <strong>{selectedDays}</strong>
          <span>days selected</span>
          <small>
            {formatDate(period.from, { day: "numeric", month: "short" })} – {formatDate(period.to)}
          </small>
        </div>
      </section>

      {status?.freshness ? (
        <p className="coverage-note">
          Inventory data is covered through {formatDate(status.freshness.coveredThrough)}.
        </p>
      ) : null}

      {searchParams.get("admin") === "1" ? (
        <section className="admin-actions" aria-label="Data operations">
          <div>
            <strong>Historical data</strong>
            <p>Rebuild every published month using the current Better Wines catalogue.</p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            disabled={backfillRunning || !apiKey}
            onClick={() => {
              if (!apiKey) return;
              setBackfillRunning(true);
              setBackfillStatus(null);
              void api
                .startHistoricalBackfill(apiKey)
                .then((result) =>
                  setBackfillStatus(`Queued ${result.months.length} months · job ${result.jobId}`),
                )
                .catch((error: unknown) =>
                  setBackfillStatus(error instanceof Error ? error.message : "Backfill failed"),
                )
                .finally(() => setBackfillRunning(false));
            }}
          >
            {backfillRunning ? "Queueing…" : "Rebuild all history"}
          </button>
          {backfillStatus ? <p role="status">{backfillStatus}</p> : null}
        </section>
      ) : null}
    </div>
  );
};
