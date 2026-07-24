import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PagePanel } from "../components/PagePanel";
import { PeriodPicker } from "../components/PeriodPicker";
import { StockoutStatistics } from "../components/StockoutStatistics";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";

export const HomePage = () => {
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const request = useApiQuery(`statistics:${period.from}:${period.to}`, (apiKey, signal) =>
    api.getStatistics(apiKey, period, signal),
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-5 sm:gap-9">
      <PageHeader className="hidden sm:flex" title="Statistics" />

      <PagePanel data-surface="controls" className="p-3 sm:p-5">
        <p className="mb-2 text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase sm:mb-2.5">
          Inventory period
        </p>
        <PeriodPicker
          period={period}
          onChange={setPeriod}
          availableMonths={status?.availableMonths}
        />
      </PagePanel>

      {request.loading && !request.data ? (
        <LoadingState label="Calculating portfolio statistics…" />
      ) : null}
      {request.error ? <ErrorState error={request.error} onRetry={request.reload} /> : null}
      {request.data ? <StockoutStatistics statistics={request.data} /> : null}
    </div>
  );
};
