import type { DailyInventory } from "../api/types";
import { formatDate } from "../utils/dates";

interface BottleHistoryProps {
  inventory: DailyInventory[];
  label: string;
}

export const BottleHistory = ({ inventory, label }: BottleHistoryProps) => {
  const current = inventory.at(-1);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>Daily bottle count</span>
        <strong className="font-medium text-foreground">
          {current ? `${current.count} latest` : "No data"}
        </strong>
      </div>
      <div
        className="flex max-w-full gap-1 overflow-x-auto pb-1"
        aria-label={`Daily bottle count for ${label}`}
      >
        {inventory.map(({ date, count }) => (
          <span
            className={
              count > 0
                ? "flex min-w-11 flex-col items-center rounded-md bg-emerald-100 px-1.5 py-1.5 text-emerald-900"
                : "flex min-w-11 flex-col items-center rounded-md bg-rose-100 px-1.5 py-1.5 text-rose-900"
            }
            key={date}
            title={`${formatDate(date)}: ${count} bottle${count === 1 ? "" : "s"}`}
          >
            <small className="text-[0.62rem] opacity-70">
              {formatDate(date, { day: "numeric", month: "short" })}
            </small>
            <strong className="text-xs">{count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};
