import type { DailyInventory } from "../api/types";
import { formatDate } from "../utils/dates";

interface BottleHistoryProps {
  inventory: DailyInventory[];
  label: string;
}

export const BottleHistory = ({ inventory, label }: BottleHistoryProps) => {
  const current = inventory.at(-1);
  const first = inventory[0];
  const showYear =
    first !== undefined &&
    current !== undefined &&
    new Date(`${current.date}T12:00:00Z`).getTime() -
      new Date(`${first.date}T12:00:00Z`).getTime() >
      365 * 24 * 60 * 60 * 1_000;
  const newestFirst = [...inventory].reverse();

  return (
    <div className="min-w-0">
      <div
        className="flex max-w-full gap-1 overflow-x-auto pb-3"
        aria-label={`Daily bottle count for ${label}`}
      >
        {newestFirst.map(({ date, count }) => (
          <span
            className={
              count > 0
                ? "flex min-w-[4.5rem] flex-col items-center border-l border-border/80 px-3 py-1.5 text-emerald-900"
                : "flex min-w-[4.5rem] flex-col items-center border-l border-border/80 px-3 py-1.5 text-rose-900"
            }
            key={date}
            title={`${formatDate(date)}: ${count} bottle${count === 1 ? "" : "s"}`}
          >
            <small className="whitespace-nowrap text-[0.62rem] opacity-70">
              {formatDate(date, {
                day: "numeric",
                month: "short",
                year: showYear ? "numeric" : false,
              })}
            </small>
            <strong className="text-xs">{count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};
