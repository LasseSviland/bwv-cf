import { ArrowRight, Globe2, Hash, Layers3 } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Period, WineCatalogItem } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { EntityMoreInfo } from "../components/EntityMoreInfo";
import { Button } from "../components/ui/button";
import { formatDate } from "../utils/dates";

const preloadWineDetailPage = () => import("./WineDetailPage");

const WineRow = memo(function WineRow({ wine, period }: { wine: WineCatalogItem; period: Period }) {
  const href = `/wines/${wine.id}?from=${period.from}&to=${period.to}`;
  return (
    <div className="grid gap-5 py-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)_auto] lg:items-center lg:py-7">
      <div className="min-w-0">
        <p
          className={`mb-2 text-[0.62rem] font-semibold tracking-[0.14em] uppercase ${
            wine.outdatedAt ? "text-amber-700" : "text-primary/65"
          }`}
        >
          {wine.outdatedAt
            ? `Outdated since ${formatDate(wine.outdatedAt)}`
            : wine.wineCategory || "Wine"}
        </p>
        <h2 className="font-serif text-2xl leading-tight font-normal tracking-[-0.025em]">
          <Link
            className="transition-colors hover:text-primary/70"
            to={href}
            title={wine.name}
            onFocus={() => void preloadWineDetailPage()}
            onMouseEnter={() => void preloadWineDetailPage()}
          >
            {wine.name}
          </Link>
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Hash className="size-3" aria-hidden="true" /> {wine.productNumber}
          </span>
          {wine.country ? (
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="size-3" aria-hidden="true" /> {wine.country}
            </span>
          ) : null}
          {wine.assortment ? (
            <span className="inline-flex items-center gap-1.5">
              <Layers3 className="size-3" aria-hidden="true" /> {wine.assortment}
            </span>
          ) : null}
        </div>
      </div>
      <BottleHistory inventory={wine.availability.bottlesByDate} label={wine.name} />
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className="hidden rounded-md border border-border/70 bg-background lg:inline-flex"
      >
        <Link
          to={href}
          aria-label={`Open ${wine.name}`}
          onFocus={() => void preloadWineDetailPage()}
          onMouseEnter={() => void preloadWineDetailPage()}
        >
          <ArrowRight />
        </Link>
      </Button>
      <EntityMoreInfo
        className="lg:col-span-3"
        kind="wine"
        entityId={String(wine.id)}
        label={wine.name}
      />
    </div>
  );
});

const wineSearchText = (wine: WineCatalogItem): string =>
  [
    wine.name,
    wine.producer ?? "",
    wine.productNumber,
    wine.country ?? "",
    wine.wineCategory ?? "",
    wine.assortment ?? "",
    ...(wine.assortmentGrades ?? []),
  ].join(" ");

const wineSearchFields = (wine: WineCatalogItem): string[] => [
  wine.name,
  wine.producer ?? "",
  wine.productNumber,
  wine.country ?? "",
  wine.wineCategory ?? "",
  wine.assortment ?? "",
  ...(wine.assortmentGrades ?? []),
  wine.outdatedAt ? "outdated" : "",
];

const sortWines = (left: WineCatalogItem, right: WineCatalogItem): number =>
  (right.availability.bottlesByDate.at(-1)?.count ?? 0) -
    (left.availability.bottlesByDate.at(-1)?.count ?? 0) ||
  right.availability.inStockAtSomePoint - left.availability.inStockAtSomePoint ||
  right.availability.currentlyInStock - left.availability.currentlyInStock ||
  left.name.localeCompare(right.name, "en");

const renderWine = (wine: WineCatalogItem, period: Period) => (
  <WineRow wine={wine} period={period} />
);

export const WinesPage = () => (
  <CatalogBrowser<WineCatalogItem>
    kind="wines"
    title="Wines"
    description="Explore the current Better Wines portfolio. Search also finds retained historical products that have left the Vinmonopolet catalogue."
    searchLabel="Search wines"
    searchPlaceholder="Search by wine name, producer, product number or category"
    emptyTitle="No wines found"
    emptyDescription="Try another wine name or product number."
    itemKey={(wine) => wine.id}
    searchText={wineSearchText}
    searchFields={wineSearchFields}
    searchOnServer
    pageSize={1_000}
    load={(apiKey, values, signal) => api.getWines(apiKey, values, signal)}
    sortItems={sortWines}
    renderItem={renderWine}
  />
);
