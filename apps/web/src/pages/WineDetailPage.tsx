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
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
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

const assortmentTermExplanation = (term: string): string => {
  if (/^Basisutvalget$/i.test(term)) {
    return "Vinmonopolet's fixed assortment. Distribution to stores follows the listed assortment grades.";
  }
  const grade = term.match(/^SB([1-6])([LR])$/i);
  if (grade) {
    return `Fixed-assortment placement for category ${grade[1]}–6 stores with the ${grade[2].toUpperCase()} profile.`;
  }
  return `Vinmonopolet assortment classification: ${term}.`;
};

const AssortmentTerm = ({ term }: { term: string }) => {
  const explanation = assortmentTermExplanation(term);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          title={explanation}
          className="cursor-help border-b border-dotted border-current/45 font-medium text-foreground outline-none hover:border-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {term}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{explanation}</TooltipContent>
    </Tooltip>
  );
};

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
  const detailRequest = useApiQuery(`wine-detail:${wineId}`, (apiKey, signal) =>
    api.getWine(apiKey, wineId, signal),
  );

  const rows = useMemo<InventoryRow[]>(() => {
    const data = request.data;
    if (!data) return [];
    const query = filter.trim().toLocaleLowerCase();
    const historical = data.wine.outdatedAt !== undefined && data.wine.outdatedAt !== null;
    return data.monopolies
      .map((entry) => ({
        ...entry,
        assortment: historical
          ? {
              status: "historical" as const,
              explanation:
                "Recorded before this product left the current Vinmonopolet catalogue; no assortment expectation is inferred.",
            }
          : classifyWineForStore(data.wine, entry.monopoly),
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
  const outdatedAt = wine.outdatedAt ?? null;
  const freshness: Freshness = request.data;
  const latestDate = latestAvailableDate(
    request.data.period.from,
    request.data.period.to,
    request.data,
  );
  const fixedStoresInStock = latestDate
    ? request.data.monopolies.filter(
        (entry) =>
          classifyWineForStore(wine, entry.monopoly).status === "required" &&
          latestCount(entry.inventory, latestDate) > 0,
      ).length
    : 0;
  const nonFixedStoresInStock = latestDate
    ? request.data.monopolies.filter(
        (entry) =>
          classifyWineForStore(wine, entry.monopoly).status === "additional" &&
          latestCount(entry.inventory, latestDate) > 0,
      ).length
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
  const sourceOrigin = detailRequest.data?.sourceData.origins;
  const originRecord =
    sourceOrigin && !Array.isArray(sourceOrigin) && typeof sourceOrigin === "object"
      ? sourceOrigin.origin
      : null;
  const origin =
    originRecord && !Array.isArray(originRecord) && typeof originRecord === "object"
      ? originRecord
      : null;
  const originLabel = [
    typeof origin?.country === "string" ? origin.country : wine.country,
    typeof origin?.region === "string" ? origin.region : null,
    typeof origin?.subRegion === "string" ? origin.subRegion : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const assortmentLabel = [wine.assortment, ...(wine.assortmentGrades ?? [])]
    .filter(Boolean)
    .join(" · ");
  const sourcePrices = detailRequest.data?.sourceData.prices;
  const prices =
    sourcePrices && !Array.isArray(sourcePrices) && typeof sourcePrices === "object"
      ? sourcePrices
      : null;
  const sourceLegacy = detailRequest.data?.sourceData.legacyDatabase;
  const legacy =
    sourceLegacy && !Array.isArray(sourceLegacy) && typeof sourceLegacy === "object"
      ? sourceLegacy
      : null;
  const sourceBasic = detailRequest.data?.sourceData.basic;
  const basic =
    sourceBasic && !Array.isArray(sourceBasic) && typeof sourceBasic === "object"
      ? sourceBasic
      : null;
  const producerLabel =
    typeof basic?.manufacturerName === "string"
      ? basic.manufacturerName
      : typeof legacy?.produsent === "string"
        ? legacy.produsent
        : null;
  const rawPrice = prices?.salesPrice ?? legacy?.pris;
  const numericPrice =
    typeof rawPrice === "number"
      ? rawPrice
      : typeof rawPrice === "string"
        ? Number(rawPrice.replace(",", "."))
        : Number.NaN;
  const priceLabel = Number.isFinite(numericPrice)
    ? numericPrice.toLocaleString("nb-NO", { style: "currency", currency: "NOK" })
    : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-7 sm:gap-9">
      <DetailHero
        title={wine.name}
        byline={
          producerLabel ? (
            <p>
              Producer <span className="font-medium text-foreground">{producerLabel}</span>
            </p>
          ) : null
        }
        summary={
          <div className="space-y-3 border-t border-border/75 pt-4">
            {outdatedAt ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong className="font-semibold">Outdated product.</strong> It was no longer in the
                current My Products catalogue on {formatDate(outdatedAt)} and is excluded from
                portfolio and monopoly statistics. This page retains its historical inventory dates.
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {originLabel ? (
                <p>
                  <span className="text-muted-foreground">Origin</span>{" "}
                  <span className="font-medium">{originLabel}</span>
                </p>
              ) : null}
              {assortmentLabel ? (
                <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-muted-foreground">Assortment</span>{" "}
                  {[wine.assortment, ...(wine.assortmentGrades ?? [])]
                    .filter((term): term is string => Boolean(term))
                    .map((term, index) => (
                      <span className="inline-flex items-baseline gap-1.5" key={term}>
                        {index > 0 ? <span aria-hidden="true">·</span> : null}
                        <AssortmentTerm term={term} />
                      </span>
                    ))}
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-6">
              {(outdatedAt
                ? [
                    { label: "Outdated since", value: formatDate(outdatedAt) },
                    ...(latestDate
                      ? [{ label: "Last inventory date", value: formatDate(latestDate) }]
                      : []),
                  ]
                : [
                    {
                      label: "Fixed stores stocked",
                      value: fixedStoresInStock.toLocaleString("en-GB"),
                    },
                    {
                      label: "Non-fixed stores stocked",
                      value: nonFixedStoresInStock.toLocaleString("en-GB"),
                    },
                    {
                      label: "Stores in stock",
                      value: `${storesInStock.toLocaleString("en-GB")} / ${request.data.monopolies.length.toLocaleString("en-GB")}`,
                    },
                    {
                      label: "Sold out",
                      value: expectedSoldOut.toLocaleString("en-GB"),
                    },
                    ...(priceLabel ? [{ label: "Current price", value: priceLabel }] : []),
                    ...(latestDate ? [{ label: "Updated", value: formatDate(latestDate) }] : []),
                  ]
              ).map((item) => (
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

      <EntityMoreInfo
        kind="wine"
        entityId={String(wine.id)}
        label={wine.name}
        sourceData={detailRequest.data?.sourceData}
      />

      <section
        className="rounded-xl border border-border/70 bg-card/88 p-4 shadow-[0_20px_60px_rgb(31_45_37/5%)] sm:p-6"
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
            className="h-12 rounded-md border-border bg-background/65 pr-4 pl-11 shadow-none"
            placeholder="Search stores by name, number or city"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          {outdatedAt ? (
            <span>Only historical stock records before {formatDate(outdatedAt)} are shown.</span>
          ) : (
            <Label className="flex items-center gap-2 rounded-md border border-border/70 bg-background/55 px-3 py-2 font-normal">
              <Checkbox
                checked={soldOutOnly}
                onCheckedChange={(checked) => setSoldOutOnly(checked === true)}
              />
              Only sold-out fixed-assortment stores
            </Label>
          )}
          <span className="font-medium">{rows.length} stores shown</span>
        </div>
      </section>

      {request.loading ? <LoadingState label="Loading wine availability…" /> : null}
      {!request.loading && request.error ? (
        <ErrorState error={request.error} onRetry={request.reload} />
      ) : null}

      {outdatedAt ? (
        <InventoryMatrix
          rows={rows}
          from={request.data.period.from}
          to={request.data.period.to}
          entityLabel="Monopoly"
          emptyTitle={filter ? "No matching stores" : "No historical inventory in this period"}
          emptyDescription={
            filter
              ? "Clear the store filter or try a different name."
              : "Choose a period before the product left the current catalogue."
          }
          freshness={freshness}
          title="Historical inventory"
          description={`Recorded stock before ${formatDate(outdatedAt)}. Later dates are unavailable for this product and are never interpreted as sold out.`}
        />
      ) : (
        <>
          <InventoryMatrix
            rows={fixedAssortmentRows}
            from={request.data.period.from}
            to={request.data.period.to}
            entityLabel="Monopoly"
            emptyTitle={
              filter
                ? "No matching stores"
                : soldOutOnly
                  ? "No fixed-assortment stores were sold out"
                  : "No stores carried this wine"
            }
            emptyDescription={
              filter
                ? "Clear the store filter or try a different name."
                : soldOutOnly
                  ? "This wine stayed in stock at every store where it belongs to the fixed assortment."
                  : "Choose another period to look for earlier or later availability."
            }
            freshness={freshness}
            title="Fixed-assortment availability"
            description="Stores where this wine belongs to the fixed assortment. Newest dates appear first."
          />

          {!soldOutOnly && additionalRows.length > 0 ? (
            <InventoryMatrix
              rows={additionalRows}
              from={request.data.period.from}
              to={request.data.period.to}
              entityLabel="Monopoly"
              emptyTitle="No stores outside the fixed assortment"
              emptyDescription="This wine was not found as optional local stock in the selected period."
              freshness={freshness}
              title="Not part of the fixed assortment"
              description="Stores carrying this wine as optional local stock. A zero does not mean sold out."
            />
          ) : null}

          {!soldOutOnly && unknownRows.length > 0 ? (
            <InventoryMatrix
              rows={unknownRows}
              from={request.data.period.from}
              to={request.data.period.to}
              entityLabel="Monopoly"
              emptyTitle="No unclassified stores"
              emptyDescription="Every store has enough category data to classify this wine."
              freshness={freshness}
              title="Assortment not classified"
              description="Stores missing the category or profile data needed to infer whether this wine is part of their fixed assortment."
            />
          ) : null}
        </>
      )}
    </div>
  );
};
