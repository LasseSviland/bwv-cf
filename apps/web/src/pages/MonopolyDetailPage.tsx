import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Freshness } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { InventoryMatrix, type InventoryRow } from "../components/InventoryMatrix";
import { PageHeader } from "../components/PageHeader";
import { PeriodPicker } from "../components/PeriodPicker";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import {
  formatDate,
  latestAvailableDate,
  latestCount,
  wasSoldOutAtSomePoint,
} from "../utils/dates";

export const MonopolyDetailPage = () => {
  const { monopolyId = "" } = useParams();
  const { status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [filter, setFilter] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const request = useApiQuery(
    `monopoly:${monopolyId}:${period.from}:${period.to}`,
    (apiKey, signal) => api.getMonopolyInventory(apiKey, monopolyId, period, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    if (!request.data) return [];
    const query = filter.trim().toLocaleLowerCase();
    const sortDate =
      latestAvailableDate(request.data.period.from, request.data.period.to, request.data) ??
      request.data.period.to;
    return request.data.wines
      .filter(
        ({ inventory }) =>
          !soldOutOnly ||
          wasSoldOutAtSomePoint(
            inventory,
            request.data!.period.from,
            request.data!.period.to,
            request.data!,
          ),
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
      .map(({ wine, inventory }) => ({
        id: String(wine.id),
        label: wine.name,
        secondary: [`Product ${wine.productNumber}`, wine.country].filter(Boolean).join(" · "),
        inventory,
        href: `/wines/${wine.id}?from=${period.from}&to=${period.to}`,
      }));
  }, [filter, period.from, period.to, request.data, soldOutOnly]);

  if (request.loading && !request.data) return <LoadingState label="Loading monopoly inventory…" />;
  if (request.error && !request.data)
    return <ErrorState error={request.error} onRetry={request.reload} />;
  if (!request.data) return null;

  const { monopoly } = request.data;
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    freshness,
  );
  const winesInStock = latestDate
    ? request.data.wines.filter(({ inventory }) => latestCount(inventory, latestDate) > 0).length
    : null;
  const responsePeriod = request.data.period;
  const soldOutWines = request.data.wines.filter(({ inventory }) =>
    wasSoldOutAtSomePoint(inventory, responsePeriod.from, responsePeriod.to, freshness),
  ).length;
  const location = [monopoly.postalCode, monopoly.city].filter(Boolean).join(" ");

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/monopolies">Monopolies</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-72 truncate">{monopoly.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        eyebrow={`Store ${monopoly.storeNumber}`}
        title={monopoly.name}
        description={[location, "Daily inventory by wine"].filter(Boolean).join(" · ")}
      />

      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <Card aria-label="Availability summary">
        <CardContent className="grid gap-4 py-1 text-sm text-muted-foreground sm:grid-cols-3">
          <span>
            <strong className="mr-1 text-lg text-foreground">{request.data.wines.length}</strong>{" "}
            Better Wines products tracked
          </span>
          <span>
            <strong className="mr-1 text-lg text-foreground">{soldOutWines}</strong> sold out during
            the period
          </span>
          <span>
            <strong className="mr-1 text-lg text-foreground">{winesInStock ?? "—"}</strong> in stock{" "}
            {latestDate ? `on ${formatDate(latestDate)}` : "now"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 py-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <Label className="grid gap-1.5" htmlFor="wine-filter">
            Filter wines in this view
            <Input
              id="wine-filter"
              type="search"
              placeholder="Wine name or product number"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </Label>
          <Label className="flex h-9 items-center gap-2 rounded-lg border px-3 font-normal">
            <Checkbox
              checked={soldOutOnly}
              onCheckedChange={(checked) => setSoldOutOnly(checked === true)}
            />
            Sold out at some point
          </Label>
          <span className="pb-2 text-xs text-muted-foreground">{rows.length} shown</span>
        </CardContent>
      </Card>

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Wine"
        emptyTitle={filter ? "No matching wines" : "No wines were stocked here"}
        emptyDescription={
          filter
            ? "Clear the wine filter or try another product name."
            : "Choose another period to look for earlier or later inventory."
        }
        freshness={freshness}
      />
    </div>
  );
};
