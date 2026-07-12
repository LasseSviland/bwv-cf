import type { Freshness, ISODate } from "../api/types";
import { formatDate, formatDateTime, isFreshnessStale } from "../utils/dates";

export const FreshnessBanner = ({
  freshness,
  periodThrough,
}: {
  freshness: Freshness;
  periodThrough?: ISODate;
}) => {
  const missing = freshness.missingMonths ?? [];
  const stale = periodThrough
    ? freshness.coveredThrough < periodThrough
    : isFreshnessStale(freshness.coveredThrough);
  const mode = missing.length > 0 ? "partial" : stale ? "stale" : "fresh";

  return (
    <aside className={`freshness freshness--${mode}`} aria-label="Dataset freshness">
      <span className="freshness__indicator" aria-hidden="true" />
      <div>
        <strong>
          {missing.length > 0
            ? "Some months are still being prepared"
            : stale
              ? "Inventory data may be behind"
              : `Inventory covered through ${formatDate(freshness.coveredThrough)}`}
        </strong>
        <p>
          Dataset generated {formatDateTime(freshness.datasetGeneratedAt)}
          {missing.length > 0 ? ` · Missing ${missing.join(", ")}` : ""}
        </p>
      </div>
    </aside>
  );
};
