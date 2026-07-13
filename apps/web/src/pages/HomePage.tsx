import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { enumerateDates, formatDate } from "../utils/dates";

export const HomePage = () => {
  const { status } = useAuth();
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
    </div>
  );
};
import { ArrowRight, CalendarDays, Database, Store, Wine } from "lucide-react";
