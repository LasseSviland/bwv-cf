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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-7 sm:gap-9">
      <PageHeader
        eyebrow="Better Wines"
        title="Portfolio overview"
        description="A clear, current view of the wines we represent and their availability across every Vinmonopolet store."
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

      <section className="grid gap-4 md:grid-cols-3" aria-label="Portfolio statistics">
        <Card className="rounded-3xl border-0 py-0 shadow-[0_22px_60px_rgb(31_45_37/7%)] ring-1 ring-foreground/8">
          <CardHeader className="px-6 pt-6 pb-5">
            <span className="mb-6 grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
              <Wine className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              {status?.catalog.wines.toLocaleString("en-GB") ?? "—"}
            </CardTitle>
            <CardDescription className="mt-1">wines in the active portfolio</CardDescription>
          </CardHeader>
          <CardFooter className="border-border/60 bg-muted/35 px-6 py-4">
            <Button
              asChild
              variant="link"
              className="h-auto p-0 font-semibold no-underline hover:no-underline"
            >
              <Link to={`/wines?from=${period.from}&to=${period.to}`}>
                Explore wines <ArrowRight />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card className="rounded-3xl border-0 py-0 shadow-[0_22px_60px_rgb(31_45_37/7%)] ring-1 ring-foreground/8">
          <CardHeader className="px-6 pt-6 pb-5">
            <span className="mb-6 grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              {status?.catalog.monopolies.toLocaleString("en-GB") ?? "—"}
            </CardTitle>
            <CardDescription className="mt-1">Vinmonopolet stores tracked</CardDescription>
          </CardHeader>
          <CardFooter className="border-border/60 bg-muted/35 px-6 py-4">
            <Button
              asChild
              variant="link"
              className="h-auto p-0 font-semibold no-underline hover:no-underline"
            >
              <Link to={`/monopolies?from=${period.from}&to=${period.to}`}>
                Explore stores <ArrowRight />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card className="rounded-3xl border-0 bg-primary py-0 text-primary-foreground shadow-[0_22px_60px_rgb(21_61_45/18%)] ring-0">
          <CardHeader className="px-6 pt-6 pb-5">
            <span className="mb-6 grid size-10 place-items-center rounded-2xl bg-white/12 text-white">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              {selectedDays}
            </CardTitle>
            <CardDescription className="mt-1 text-white/60">days in this view</CardDescription>
          </CardHeader>
          <CardFooter className="border-white/12 bg-white/6 px-6 py-4 text-xs text-white/65">
            {formatDate(period.from, { day: "numeric", month: "short" })} – {formatDate(period.to)}
          </CardFooter>
        </Card>
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
import { ArrowRight, CalendarDays, Database, Store, Wine } from "lucide-react";
