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
import { classifyWineForStore, wineAssortmentLabel } from "../utils/assortment";
import {
  formatDate,
  latestAvailableDate,
  latestCount,
  wasSoldOutAtSomePoint,
} from "../utils/dates";

export const MonopolyDetailPage = () => {
  const { monopolyId = "" } = useParams();
  const { setHeaderContent } = useOutletContext<AppShellOutletContext>();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [filter, setFilter] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const request = useApiQuery(
    `monopoly:${monopolyId}:${period.from}:${period.to}`,
    (apiKey, signal) => api.getMonopolyInventory(apiKey, monopolyId, period, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    const data = request.data;
    if (!data) return [];
    const query = filter.trim().toLocaleLowerCase();
    const sortDate = latestAvailableDate(data.period.from, data.period.to, data) ?? data.period.to;
    return data.wines
      .map((entry) => ({
        ...entry,
        assortment: classifyWineForStore(entry.wine, data.monopoly),
      }))
      .filter(
        ({ inventory, assortment }) =>
          !soldOutOnly ||
          (assortment.status === "required" &&
            wasSoldOutAtSomePoint(inventory, data.period.from, data.period.to, data)),
      )
      .filter(({ wine }) =>
        query
          ? [wine.name, wine.productNumber, wine.country]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((left, right) => {
        const stockDifference =
          latestCount(right.inventory, sortDate) - latestCount(left.inventory, sortDate);
        return stockDifference || left.wine.name.localeCompare(right.wine.name);
      })
      .map(({ wine, inventory, assortment }) => ({
        id: String(wine.id),
        label: wine.name,
        secondary: wineAssortmentLabel(wine),
        assortmentStatus: assortment.status,
        assortmentNote: assortment.explanation,
        inventory,
        href: `/wines/${wine.id}?from=${period.from}&to=${period.to}`,
      }));
  }, [filter, period.from, period.to, request.data, soldOutOnly]);

  const fixedAssortmentRows = rows.filter((row) => row.assortmentStatus === "required");
  const additionalRows = rows.filter((row) => row.assortmentStatus === "additional");
  const unknownRows = rows.filter((row) => row.assortmentStatus === "unknown");

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
              <Link to="/monopolies">Stores</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-48 truncate sm:max-w-72">
              {request.data.monopoly.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    return () => setHeaderContent(null);
  }, [request.data, setHeaderContent]);

  if (request.loading && !request.data) return <LoadingState label="Loading monopoly inventory…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { monopoly } = request.data;
  const detailedCategory = (monopoly.storeAssortment ?? monopoly.monopolyCategory)?.replace(
    /^SB/i,
    "",
  );
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    request.data,
  );
  const winesInStock = latestDate
    ? request.data.wines.filter((entry) => latestCount(entry.inventory, latestDate) > 0).length
    : 0;
  const fixedWinesInStock = latestDate
    ? request.data.wines.filter(
        (entry) =>
          classifyWineForStore(entry.wine, monopoly).status === "required" &&
          latestCount(entry.inventory, latestDate) > 0,
      ).length
    : 0;
  const additionalWinesInStock = latestDate
    ? request.data.wines.filter(
        (entry) =>
          classifyWineForStore(entry.wine, monopoly).status === "additional" &&
          latestCount(entry.inventory, latestDate) > 0,
      ).length
    : 0;
  const soldOutWines = latestDate
    ? request.data.wines.filter(
        (entry) =>
          classifyWineForStore(entry.wine, monopoly).status === "required" &&
          latestCount(entry.inventory, latestDate) === 0,
      ).length
    : 0;
  return (
    <div className="flex w-full min-w-0 flex-col gap-7 sm:gap-9">
      <DetailHero
        title={monopoly.name}
        summary={
          <div className="space-y-3 border-t border-border/75 pt-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {monopoly.postalCode || monopoly.city ? (
                <p>
                  <span className="text-muted-foreground">Location</span>{" "}
                  <span className="font-medium">
                    {[monopoly.postalCode, monopoly.city].filter(Boolean).join(" ")}
                  </span>
                </p>
              ) : null}
              {detailedCategory ? (
                <p>
                  <span className="text-muted-foreground">Category</span>{" "}
                  <span className="font-medium">{detailedCategory}</span>
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-5">
              {[
                {
                  label: "Fixed wines stocked",
                  value: fixedWinesInStock.toLocaleString("en-GB"),
                },
                {
                  label: "Additional wines stocked",
                  value: additionalWinesInStock.toLocaleString("en-GB"),
                },
                {
                  label: "Wines in stock",
                  value: `${winesInStock.toLocaleString("en-GB")} / ${request.data.wines.length.toLocaleString("en-GB")}`,
                },
                {
                  label: "Sold out",
                  value: soldOutWines.toLocaleString("en-GB"),
                },
                ...(latestDate ? [{ label: "Updated", value: formatDate(latestDate) }] : []),
              ].map((item) => (
                <div className="min-w-0" key={item.label}>
                  <dt className="flex min-h-8 items-end text-[0.68rem] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-base leading-none font-semibold text-foreground tabular-nums">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />

      <EntityMoreInfo kind="monopoly" entityId={String(monopoly.id)} label={monopoly.name} />

      <section
        className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-[0_20px_60px_rgb(31_45_37/5%)] sm:p-6"
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
            id="wine-filter"
            type="search"
            className="h-12 rounded-md border-border bg-background pr-4 pl-11 shadow-none"
            placeholder="Search wines by name, product number or country"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <Label className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 font-normal">
            <Checkbox
              checked={soldOutOnly}
              onCheckedChange={(checked) => setSoldOutOnly(checked === true)}
            />
            Only sold-out fixed-assortment wines
          </Label>
          <span className="font-medium">{rows.length} wines shown</span>
        </div>
      </section>

      {request.loading ? <LoadingState label="Loading monopoly inventory…" /> : null}
      {!request.loading && request.error ? (
        <ErrorState error={request.error} onRetry={request.reload} />
      ) : null}

      <InventoryMatrix
        rows={fixedAssortmentRows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Wine"
        emptyTitle={
          filter
            ? "No matching wines"
            : soldOutOnly
              ? "No fixed-assortment wines were sold out"
              : "No fixed-assortment wines were stocked here"
        }
        emptyDescription={
          filter
            ? "Clear the wine filter or try another product name."
            : soldOutOnly
              ? "Every wine this store was expected to carry stayed in stock for the period."
              : "Choose another period to look for earlier or later availability."
        }
        freshness={freshness}
        title="Fixed-assortment availability"
        description="Wines that belong to this store's fixed assortment. Newest dates appear first."
      />

      {!soldOutOnly && additionalRows.length > 0 ? (
        <InventoryMatrix
          rows={additionalRows}
          from={request.data.period.from}
          to={request.data.period.to}
          entityLabel="Wine"
          emptyTitle="No wines outside the fixed assortment"
          emptyDescription="No wines were found as optional local stock in the selected period."
          freshness={freshness}
          title="Not part of the fixed assortment"
          description="Wines carried as optional local stock. A zero does not mean sold out."
        />
      ) : null}

      {!soldOutOnly && unknownRows.length > 0 ? (
        <InventoryMatrix
          rows={unknownRows}
          from={request.data.period.from}
          to={request.data.period.to}
          entityLabel="Wine"
          emptyTitle="No unclassified wines"
          emptyDescription="Every wine has enough assortment data to classify it for this store."
          freshness={freshness}
          title="Assortment not classified"
          description="Wines missing the category data needed to infer whether they belong to this store's fixed assortment."
        />
      ) : null}
    </div>
  );
};
