import { ArrowRight, MapPin, SlidersHorizontal } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolyCatalogItem } from "../api/types";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { EntityMoreInfo } from "../components/EntityMoreInfo";
import { Button } from "../components/ui/button";
import { numericCategories } from "../utils/categories";

const preloadMonopolyDetailPage = () => import("./MonopolyDetailPage");

const monopolyCategoryNumbers = (monopoly: MonopolyCatalogItem): string[] =>
  numericCategories(monopoly.monopolyCategory, monopoly.storeAssortment);

const MonopolyRow = memo(function MonopolyRow({ monopoly }: { monopoly: MonopolyCatalogItem }) {
  const href = `/monopolies/${monopoly.id}`;
  const currentlyFixedInStock = monopoly.availability.currentlyFixedInStock;
  const currentlyAdditionalInStock = monopoly.availability.currentlyAdditionalInStock;
  const currentlySoldOut = monopoly.availability.currentlySoldOut;
  const detailedCategory = monopolyCategoryNumbers(monopoly).join(", ");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.75fr)] gap-x-5 gap-y-4 py-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)_auto] lg:items-center lg:gap-5 lg:py-7">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl leading-tight font-normal tracking-[-0.025em]">
          <Link
            className="transition-colors hover:text-primary/70"
            to={href}
            title={monopoly.name}
            onFocus={() => void preloadMonopolyDetailPage()}
            onMouseEnter={() => void preloadMonopolyDetailPage()}
          >
            {monopoly.name}
          </Link>
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {monopoly.postalCode || monopoly.city ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3" aria-hidden="true" />
              {[monopoly.postalCode, monopoly.city].filter(Boolean).join(" ")}
            </span>
          ) : null}
          {detailedCategory ? (
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="size-3" aria-hidden="true" /> Category{" "}
              {detailedCategory}
            </span>
          ) : null}
        </div>
      </div>
      <dl
        className="grid grid-cols-1 gap-3 lg:grid-cols-3"
        aria-label={`Latest wine availability at ${monopoly.name}`}
      >
        <div className="flex items-baseline justify-between gap-3 border-l border-border/80 pl-4">
          <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Fixed wines stocked
          </dt>
          <dd className="shrink-0 text-2xl leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums">
            {currentlyFixedInStock === undefined
              ? "—"
              : currentlyFixedInStock.toLocaleString("en-GB")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-l border-border/80 pl-4">
          <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Additional wines stocked
          </dt>
          <dd className="shrink-0 text-2xl leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums">
            {currentlyAdditionalInStock === undefined
              ? "—"
              : currentlyAdditionalInStock.toLocaleString("en-GB")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-l border-border/80 pl-4">
          <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Wines sold out
          </dt>
          <dd className="shrink-0 text-2xl leading-none font-semibold tracking-[-0.04em] text-rose-700 tabular-nums">
            {currentlySoldOut === undefined ? "—" : currentlySoldOut.toLocaleString("en-GB")}
          </dd>
        </div>
      </dl>
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className="hidden rounded-md border border-border/70 bg-background lg:inline-flex"
      >
        <Link
          to={href}
          aria-label={`Open ${monopoly.name}`}
          onFocus={() => void preloadMonopolyDetailPage()}
          onMouseEnter={() => void preloadMonopolyDetailPage()}
        >
          <ArrowRight />
        </Link>
      </Button>
      <EntityMoreInfo
        className="col-span-2 lg:col-span-3"
        kind="monopoly"
        entityId={String(monopoly.id)}
        label={monopoly.name}
      />
    </div>
  );
});

const monopolySearchText = (monopoly: MonopolyCatalogItem): string =>
  [
    monopoly.name,
    monopoly.storeNumber,
    monopoly.postalCode ?? "",
    monopoly.city ?? "",
    monopoly.monopolyCategory ?? "",
    monopoly.monopolyProfile ?? "",
    monopoly.storeAssortment ?? "",
  ].join(" ");

const monopolySearchFields = (monopoly: MonopolyCatalogItem): string[] => [
  monopoly.name,
  monopoly.storeNumber,
  monopoly.postalCode ?? "",
  monopoly.city ?? "",
  monopoly.monopolyCategory ?? "",
  monopoly.monopolyProfile ?? "",
  monopoly.storeAssortment ?? "",
];

const monopolySortOptions: Array<{
  value: string;
  label: string;
  compare: (left: MonopolyCatalogItem, right: MonopolyCatalogItem) => number;
}> = [
  {
    value: "name",
    label: "Name",
    compare: (left, right) => left.name.localeCompare(right.name, "nb-NO"),
  },
  {
    value: "category",
    label: "Category",
    compare: (left, right) => {
      const leftCategory = monopolyCategoryNumbers(left)[0];
      const rightCategory = monopolyCategoryNumbers(right)[0];
      if (!leftCategory && rightCategory) return 1;
      if (leftCategory && !rightCategory) return -1;
      return (
        (rightCategory ?? "").localeCompare(leftCategory ?? "", "nb-NO", {
          numeric: true,
        }) || left.name.localeCompare(right.name, "nb-NO")
      );
    },
  },
  {
    value: "wines-in-stock",
    label: "Wines in stock",
    compare: (left, right) =>
      right.availability.currentlyInStock - left.availability.currentlyInStock ||
      left.name.localeCompare(right.name, "nb-NO"),
  },
  {
    value: "wines-sold-out",
    label: "Wines sold out",
    compare: (left, right) =>
      (right.availability.currentlySoldOut ?? -1) - (left.availability.currentlySoldOut ?? -1) ||
      left.name.localeCompare(right.name, "nb-NO"),
  },
];

const renderMonopoly = (monopoly: MonopolyCatalogItem) => <MonopolyRow monopoly={monopoly} />;

export const MonopoliesPage = () => (
  <CatalogBrowser<MonopolyCatalogItem>
    kind="monopolies"
    title="Stores"
    headerEyebrow={null}
    latestOnly
    searchLabel="Search stores"
    searchPlaceholder="Search stores"
    emptyTitle="No monopolies found"
    emptyDescription="Try another store name, number, postcode or city."
    itemKey={(monopoly) => monopoly.id}
    searchText={monopolySearchText}
    searchFields={monopolySearchFields}
    categoryFilterLabel="Store categories"
    categoryValues={monopolyCategoryNumbers}
    pageSize={1_000}
    load={(apiKey, values, signal) => api.getMonopolies(apiKey, values, signal)}
    defaultSort="wines-in-stock"
    sortOptions={monopolySortOptions}
    renderItem={renderMonopoly}
  />
);
