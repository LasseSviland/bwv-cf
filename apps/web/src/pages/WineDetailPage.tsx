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
import { wasSoldOutAtSomePoint } from "../utils/dates";

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
    if (!request.data) return [];
    const query = filter.trim().toLocaleLowerCase();
    return request.data.monopolies
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
      .filter(({ monopoly }) =>
        query
          ? [monopoly.name, monopoly.storeNumber, monopoly.city, monopoly.postalCode]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((left, right) => left.monopoly.name.localeCompare(right.monopoly.name, "nb"))
      .map(({ monopoly, inventory }) => ({
        id: String(monopoly.id),
        label: monopoly.name,
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

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader title={wine.name} />

      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />

      <div className="space-y-3">
        <Input
          id="store-filter"
          type="search"
          className="bg-card"
          placeholder="Search stores by name, number or city"
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
          <span>{rows.length} stores shown</span>
        </div>
      </div>

      <InventoryMatrix
        rows={rows}
        from={request.data.period.from}
        to={request.data.period.to}
        entityLabel="Monopoly"
        emptyTitle={filter ? "No matching stores" : "No stores carried this wine"}
        emptyDescription={
          filter
            ? "Clear the store filter or try a different name."
            : "Choose another period to look for earlier or later availability."
        }
        freshness={freshness}
      />
    </div>
  );
};
