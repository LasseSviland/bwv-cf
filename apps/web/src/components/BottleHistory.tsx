import type { DailyInventory } from "../api/types";
import { formatDate } from "../utils/dates";

interface BottleHistoryProps {
  inventory: DailyInventory[];
  label: string;
}

export const BottleHistory = ({ inventory, label }: BottleHistoryProps) => {
  const current = inventory.at(-1);

  return (
    <div className="bottle-history">
      <div className="bottle-history__summary">
        <span>Daily bottle count</span>
        <strong>{current ? `${current.count} latest` : "No data"}</strong>
      </div>
      <div className="bottle-history__days" aria-label={`Daily bottle count for ${label}`}>
        {inventory.map(({ date, count }) => (
          <span
            className={count > 0 ? "bottle-history__day is-in" : "bottle-history__day is-out"}
            key={date}
            title={`${formatDate(date)}: ${count} bottle${count === 1 ? "" : "s"}`}
          >
            <small>{formatDate(date, { day: "numeric", month: "short" })}</small>
            <strong>{count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};
