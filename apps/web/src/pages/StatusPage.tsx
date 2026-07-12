import { api } from "../api/client";
import type { Month } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { FreshnessBanner } from "../components/FreshnessBanner";
import { PageHeader } from "../components/PageHeader";
import { useApiQuery } from "../hooks/useApiQuery";
import { formatDate, formatMonth } from "../utils/dates";

const MonthCard = ({ month }: { month: Month }) => (
  <article className="month-status-card">
    <div>
      <h3>{formatMonth(month)}</h3>
      <p>Historic monthly dataset</p>
    </div>
    <span className="status-pill status-pill--in">Available</span>
  </article>
);

export const StatusPage = () => {
  const request = useApiQuery("status", (apiKey, signal) => api.getStatus(apiKey, signal));

  if (request.loading && !request.data) return <LoadingState label="Loading data status…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const available = [...request.data.availableMonths].sort().reverse();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Data status"
        description="See how current the inventory is and which historic months are ready to browse."
        actions={
          <button
            className="button button--secondary"
            type="button"
            onClick={request.reload}
            disabled={request.loading}
          >
            {request.loading ? "Refreshing…" : "Refresh status"}
          </button>
        }
      />

      {request.data.freshness ? (
        <>
          <FreshnessBanner freshness={request.data.freshness} />
          <section className="metric-grid" aria-label="Dataset summary">
            <div className="metric-card metric-card--accent">
              <span>Covered through</span>
              <strong className="metric-card__date">
                {formatDate(request.data.freshness.coveredThrough)}
              </strong>
              <small>Latest morning snapshot</small>
            </div>
            <div className="metric-card">
              <span>Historic months</span>
              <strong>{available.length}</strong>
              <small>Ready to browse</small>
            </div>
            <div className="metric-card">
              <span>Source watermark</span>
              <strong className="metric-card__number">
                {request.data.freshness.sourceWatermark.toLocaleString("en-GB")}
              </strong>
              <small>Highest source inventory ID</small>
            </div>
          </section>
        </>
      ) : (
        <div className="state-panel">
          <span className="state-panel__icon" aria-hidden="true">
            …
          </span>
          <div>
            <strong>The first inventory datasets are being prepared</strong>
            <p>This page will fill with freshness information as each month is published.</p>
          </div>
        </div>
      )}

      <section className="status-section" aria-labelledby="months-heading">
        <div className="section-heading section-heading--row">
          <div>
            <p className="eyebrow">Published archive</p>
            <h2 id="months-heading">Available months</h2>
          </div>
          <span className="count-badge">{available.length}</span>
        </div>
        {available.length > 0 ? (
          <div className="month-status-grid">
            {available.map((month) => (
              <MonthCard key={month} month={month} />
            ))}
          </div>
        ) : (
          <p className="muted-copy">No monthly datasets have been published yet.</p>
        )}
      </section>
    </div>
  );
};
