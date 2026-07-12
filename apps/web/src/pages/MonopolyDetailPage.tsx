import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
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
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import type { AppShellOutletContext } from "../layout/AppShell";
import { latestAvailableDate, latestCount, wasSoldOutAtSomePoint } from "../utils/dates";

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
              <Link to="/monopolies">Monopolies</Link>
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
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader title={monopoly.name} />

      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <div className="space-y-3">
        <Input
          id="wine-filter"
          type="search"
          className="bg-card"
          placeholder="Search wines by name or product number"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={soldOutOnly}
              onCheckedChange={(checked) => setSoldOutOnly(checked === true)}
            />
            Sold out at some point
          </Label>
          <span>{rows.length} wines shown</span>
        </div>
      </div>

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
