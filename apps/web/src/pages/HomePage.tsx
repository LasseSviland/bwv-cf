import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeader title="Statistics" />

      <section className="border-b border-border pb-5">
        <PeriodPicker
          period={period}
          onChange={setPeriod}
          availableMonths={status?.availableMonths}
        />
      </section>

      {request.loading && !request.data ? (
        <LoadingState label="Calculating portfolio statistics…" />
      ) : null}
      {request.error ? <ErrorState error={request.error} onRetry={request.reload} /> : null}
      {request.data ? <StockoutStatistics statistics={request.data} /> : null}
    </div>
  );
};
