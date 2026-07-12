import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { enumerateDates, formatDate } from "../utils/dates";

export const HomePage = () => {
  const { status } = useAuth();
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
    </div>
  );
};
