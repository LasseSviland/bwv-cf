import { Hash, MapPin, Search, SlidersHorizontal } from "lucide-react";
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
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    request.data,
  );
  const currentBottles = latestDate
    ? request.data.wines.reduce(
        (total, entry) => total + latestCount(entry.inventory, latestDate),
        0,
      )
    : 0;
  const winesInStock = latestDate
    ? request.data.wines.filter((entry) => latestCount(entry.inventory, latestDate) > 0).length
    : 0;
  const requiredSoldOut = latestDate
    ? request.data.wines.filter(
        (entry) =>
          classifyWineForStore(entry.wine, monopoly).status === "required" &&
          latestCount(entry.inventory, latestDate) === 0,
      ).length
    : 0;
  return (
    <div className="flex w-full min-w-0 flex-col gap-7 sm:gap-9">
      <DetailHero
        eyebrow="Vinmonopolet store"
        title={monopoly.name}
        metadata={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Hash className="size-3.5" aria-hidden="true" /> Store {monopoly.storeNumber}
            </span>
            {monopoly.city ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                {[monopoly.postalCode, monopoly.city].filter(Boolean).join(" ")}
              </span>
            ) : null}
            {monopoly.monopolyCategory ? (
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Category{" "}
                {monopoly.monopolyCategory}
                {monopoly.monopolyProfile ? ` · ${monopoly.monopolyProfile}` : ""}
              </span>
            ) : null}
          </>
        }
        metrics={[
          {
            label: "Portfolio bottles",
            value: currentBottles.toLocaleString("en-GB"),
            detail: latestDate ? `Current stock · ${formatDate(latestDate)}` : "No current data",
          },
          {
            label: "Wines in stock",
            value: winesInStock.toLocaleString("en-GB"),
            detail: `of ${request.data.wines.length.toLocaleString("en-GB")} tracked wines`,
          },
          {
            label: "Required wines sold out",
            value: requiredSoldOut.toLocaleString("en-GB"),
            detail: "Current fixed-assortment gaps",
          },
        ]}
      />

      <EntityMoreInfo kind="monopoly" entityId={String(monopoly.id)} label={monopoly.name} />

      <section className="rounded-3xl border border-border/70 bg-card/88 p-4 shadow-[0_20px_60px_rgb(31_45_37/5%)] sm:p-6">
        <div>
          <p className="text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
            Availability explorer
          </p>
          <h2 className="mt-1 font-serif text-2xl font-normal tracking-[-0.025em]">
            Explore the store portfolio
          </h2>
        </div>
        <div className="mt-5 border-t border-border/70 pt-5">
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
            className="h-12 rounded-2xl border-border bg-background/65 pr-4 pl-11 shadow-none"
            placeholder="Search wines by name, product number or country"
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
            Required products sold out at some point
          </Label>
          <span className="font-medium">{rows.length} wines shown</span>
        </div>
      </section>

      {request.loading ? <LoadingState label="Loading monopoly inventory…" /> : null}
      {!request.loading && request.error ? (
        <ErrorState error={request.error} onRetry={request.reload} />
      ) : null}

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Wine"
        emptyTitle={
          filter
            ? "No matching wines"
            : soldOutOnly
              ? "No required products were sold out"
              : "No wines were stocked here"
        }
        emptyDescription={
          filter
            ? "Clear the wine filter or try another product name."
            : soldOutOnly
              ? "Products in this store's fixed assortment stayed in stock for the period."
              : "Choose another period to look for earlier or later inventory."
        }
        freshness={freshness}
      />
    </div>
  );
};
