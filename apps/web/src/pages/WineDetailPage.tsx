import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Freshness } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { DetailHero } from "../components/DetailHero";
import { EntityMoreInfo } from "../components/EntityMoreInfo";
import { InventoryMatrix, type InventoryRow } from "../components/InventoryMatrix";
import { PeriodPicker } from "../components/PeriodPicker";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import type { AppShellOutletContext } from "../layout/AppShell";
import { classifyWineForStore, storeAssortmentLabel } from "../utils/assortment";
import {
  formatDate,
  latestAvailableDate,
  latestCount,
  wasSoldOutAtSomePoint,
} from "../utils/dates";

export const WineDetailPage = () => {
  const { wineId = "" } = useParams();
  const { setHeaderContent } = useOutletContext<AppShellOutletContext>();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [filter, setFilter] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const request = useApiQuery(`wine:${wineId}:${period.from}:${period.to}`, (apiKey, signal) =>
    api.getWineInventory(apiKey, wineId, period, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    const data = request.data;
    if (!data) return [];
    const query = filter.trim().toLocaleLowerCase();
    return data.monopolies
      .map((entry) => ({
        ...entry,
        assortment: classifyWineForStore(data.wine, entry.monopoly),
      }))
      .filter(
        ({ inventory, assortment }) =>
          !soldOutOnly ||
          (assortment.status === "required" &&
            wasSoldOutAtSomePoint(inventory, data.period.from, data.period.to, data)),
      )
      .filter(({ monopoly }) =>
        query
          ? [monopoly.name, monopoly.storeNumber, monopoly.city, monopoly.postalCode]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((left, right) => left.monopoly.name.localeCompare(right.monopoly.name, "nb"))
      .map(({ monopoly, inventory, assortment }) => ({
        id: String(monopoly.id),
        label: monopoly.name,
        secondary: storeAssortmentLabel(monopoly),
        assortmentStatus: assortment.status,
        assortmentNote: assortment.explanation,
        inventory,
        href: `/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`,
      }));
  }, [filter, period.from, period.to, request.data, soldOutOnly]);

  useEffect(() => {
    if (!request.data) {
      setHeaderContent(null);
      return;
    }

    setHeaderContent(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/wines">Wines</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-48 truncate sm:max-w-72">
              {request.data.wine.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    return () => setHeaderContent(null);
  }, [request.data, setHeaderContent]);

  if (request.loading && !request.data) return <LoadingState label="Loading wine availability…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { wine } = request.data;
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    request.data,
  );
  const currentBottles = latestDate
    ? request.data.monopolies.reduce(
        (total, entry) => total + latestCount(entry.inventory, latestDate),
        0,
      )
    : 0;
  const storesInStock = latestDate
    ? request.data.monopolies.filter((entry) => latestCount(entry.inventory, latestDate) > 0).length
    : 0;
  const expectedSoldOut = latestDate
    ? request.data.monopolies.filter(
        (entry) =>
          classifyWineForStore(wine, entry.monopoly).status === "required" &&
          latestCount(entry.inventory, latestDate) === 0,
      ).length
    : 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-7 sm:gap-9">
      <DetailHero
        title={wine.name}
        metrics={[
          {
            label: "Bottles available",
            value: currentBottles.toLocaleString("en-GB"),
            detail: latestDate ? `Across Norway · ${formatDate(latestDate)}` : "No current data",
          },
          {
            label: "Stores in stock",
            value: storesInStock.toLocaleString("en-GB"),
            detail: `of ${request.data.monopolies.length.toLocaleString("en-GB")} tracked stores`,
          },
          {
            label: "Expected stores sold out",
            value: expectedSoldOut.toLocaleString("en-GB"),
            detail: "Current fixed-assortment gaps",
          },
        ]}
      />

      <EntityMoreInfo kind="wine" entityId={String(wine.id)} label={wine.name} />

      <section
        className="rounded-3xl border border-border/70 bg-card/88 p-4 shadow-[0_20px_60px_rgb(31_45_37/5%)] sm:p-6"
        aria-label="Availability filters"
      >
        <div>
          <PeriodPicker
            period={period}
            onChange={setPeriod}
            availableMonths={status?.availableMonths}
          />
        </div>

        <div className="relative mt-5">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="store-filter"
            type="search"
            className="h-12 rounded-2xl border-border bg-background/65 pr-4 pl-11 shadow-none"
            placeholder="Search stores by name, number or city"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <Label className="flex items-center gap-2 rounded-full border border-border/70 bg-background/55 px-3 py-2 font-normal">
            <Checkbox
              checked={soldOutOnly}
              onCheckedChange={(checked) => setSoldOutOnly(checked === true)}
            />
            Sold out where expected
          </Label>
          <span className="font-medium">{rows.length} stores shown</span>
        </div>
      </section>

      {request.loading ? <LoadingState label="Loading wine availability…" /> : null}
      {!request.loading && request.error ? (
        <ErrorState error={request.error} onRetry={request.reload} />
      ) : null}

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Monopoly"
        emptyTitle={
          filter
            ? "No matching stores"
            : soldOutOnly
              ? "No expected stores were sold out"
              : "No stores carried this wine"
        }
        emptyDescription={
          filter
            ? "Clear the store filter or try a different name."
            : soldOutOnly
              ? "This wine stayed in stock wherever it was part of the fixed assortment."
              : "Choose another period to look for earlier or later availability."
        }
        freshness={freshness}
      />
    </div>
  );
};
