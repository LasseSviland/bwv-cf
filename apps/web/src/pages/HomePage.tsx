import { ArrowRight, Database, Store, Wine } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { StockoutStatistics } from "../components/StockoutStatistics";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { formatDate } from "../utils/dates";

export const HomePage = () => {
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const request = useApiQuery(`statistics:${period.from}:${period.to}`, (apiKey, signal) =>
    api.getStatistics(apiKey, period, signal),
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-7 sm:gap-9">
      <PageHeader
        eyebrow="Better Wines"
        title="Portfolio statistics"
        description="A complete view of stockout pressure, affected wines, and availability across every tracked Vinmonopolet placement."
      />

      <section className="rounded-3xl border border-border/70 bg-card/88 p-4 shadow-[0_20px_60px_rgb(31_45_37/5%)] sm:p-5">
        <p className="mb-2.5 text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Reporting period
        </p>
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

      <section aria-labelledby="portfolio-coverage-heading" className="space-y-4">
        <div>
          <p className="text-[0.66rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Portfolio coverage
          </p>
          <h2
            id="portfolio-coverage-heading"
            className="mt-1 font-serif text-2xl tracking-[-0.025em]"
          >
            The network behind the numbers
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              icon: Wine,
              value: status?.catalog.wines,
              label: "wines in the active portfolio",
              action: "Explore wines",
              to: `/wines?from=${period.from}&to=${period.to}`,
            },
            {
              icon: Store,
              value: status?.catalog.monopolies,
              label: "Vinmonopolet stores tracked",
              action: "Explore stores",
              to: `/monopolies?from=${period.from}&to=${period.to}`,
            },
          ].map(({ icon: Icon, value, label, action, to }) => (
            <Card
              key={label}
              className="rounded-3xl border-0 py-0 shadow-[0_18px_50px_rgb(31_45_37/5%)] ring-1 ring-foreground/8"
            >
              <CardHeader className="px-6 pt-6 pb-5">
                <span className="mb-5 grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <CardTitle className="text-4xl font-semibold tracking-[-0.045em]">
                  {value?.toLocaleString("en-GB") ?? "—"}
                </CardTitle>
                <CardDescription className="mt-1">{label}</CardDescription>
              </CardHeader>
              <CardFooter className="border-border/60 bg-muted/35 px-6 py-4">
                <Button
                  asChild
                  variant="link"
                  className="h-auto p-0 font-semibold no-underline hover:no-underline"
                >
                  <Link to={to}>
                    {action} <ArrowRight />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {status?.freshness ? (
        <Alert className="rounded-2xl border-border/70 bg-card/70 py-3 shadow-none">
          <Database />
          <AlertDescription>
            Inventory is current through{" "}
            <strong>{formatDate(status.freshness.coveredThrough)}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
