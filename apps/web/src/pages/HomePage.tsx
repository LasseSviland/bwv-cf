import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6">
      <PageHeader
        title="Statistics"
        description="A compact view of the Better Wines portfolio and the selected inventory period."
      />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <section className="grid gap-4 md:grid-cols-3" aria-label="Portfolio statistics">
        <Card>
          <CardHeader>
            <Wine className="mb-4 size-5 text-primary" />
            <CardTitle className="font-serif text-4xl">
              {status?.catalog.wines.toLocaleString("en-GB") ?? "—"}
            </CardTitle>
            <CardDescription>Better Wines products</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to={`/wines?from=${period.from}&to=${period.to}`}>
                View wines <ArrowRight />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <Store className="mb-4 size-5 text-primary" />
            <CardTitle className="font-serif text-4xl">
              {status?.catalog.monopolies.toLocaleString("en-GB") ?? "—"}
            </CardTitle>
            <CardDescription>monopolies tracked</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to={`/monopolies?from=${period.from}&to=${period.to}`}>
                View monopolies <ArrowRight />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CalendarDays className="mb-4 size-5 text-primary" />
            <CardTitle className="font-serif text-4xl">{selectedDays}</CardTitle>
            <CardDescription>days selected</CardDescription>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {formatDate(period.from, { day: "numeric", month: "short" })} – {formatDate(period.to)}
          </CardFooter>
        </Card>
      </section>

      {status?.freshness ? (
        <Alert>
          <Database />
          <AlertDescription>
            Inventory data is covered through {formatDate(status.freshness.coveredThrough)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {searchParams.get("admin") === "1" ? (
        <Card aria-label="Data operations">
          <CardContent className="grid gap-4 py-1 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <strong className="font-medium">Historical data</strong>
              <p className="mt-1 text-sm text-muted-foreground">
                Rebuild every published month using the current Better Wines catalogue.
              </p>
            </div>
            <Button
              variant="outline"
              type="button"
              disabled={backfillRunning || !apiKey}
              onClick={() => {
                if (!apiKey) return;
                setBackfillRunning(true);
                setBackfillStatus(null);
                void api
                  .startHistoricalBackfill(apiKey)
                  .then((result) =>
                    setBackfillStatus(
                      `Queued ${result.months.length} months · job ${result.jobId}`,
                    ),
                  )
                  .catch((error: unknown) =>
                    setBackfillStatus(error instanceof Error ? error.message : "Backfill failed"),
                  )
                  .finally(() => setBackfillRunning(false));
              }}
            >
              {backfillRunning ? "Queueing…" : "Rebuild all history"}
            </Button>
            {backfillStatus ? (
              <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                {backfillStatus}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
import { ArrowRight, CalendarDays, Database, Store, Wine } from "lucide-react";
