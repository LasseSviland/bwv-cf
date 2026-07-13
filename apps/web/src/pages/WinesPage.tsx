import { ArrowRight, Globe2, Hash, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Period, WineCatalogItem } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { EntityMoreInfo } from "../components/EntityMoreInfo";
import { Button } from "../components/ui/button";

const WineRow = ({ wine, period }: { wine: WineCatalogItem; period: Period }) => {
  const href = `/wines/${wine.id}?from=${period.from}&to=${period.to}`;
  return (
    <div className="grid gap-5 py-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)_auto] lg:items-center lg:py-7">
      <div className="min-w-0">
        <p className="mb-2 text-[0.62rem] font-semibold tracking-[0.14em] text-primary/65 uppercase">
          {wine.wineCategory || "Wine"}
        </p>
        <h2 className="font-serif text-2xl leading-tight font-normal tracking-[-0.025em]">
          <Link className="transition-colors hover:text-primary/70" to={href} title={wine.name}>
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
        className="hidden rounded-full border border-border/70 bg-background/50 lg:inline-flex"
      >
        <Link to={href} aria-label={`Open ${wine.name}`}>
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
};

export const WinesPage = () => (
  <CatalogBrowser<WineCatalogItem>
    kind="wines"
    title="Wines"
    description="Explore every bottle in the Better Wines portfolio, with current stock and recent movement across Norway."
    searchLabel="Search wines"
    searchPlaceholder="Search by wine name, product number or category"
    emptyTitle="No wines found"
    emptyDescription="Try another wine name or product number."
    itemKey={(wine) => wine.id}
    searchText={(wine) =>
      [
        wine.name,
        wine.productNumber,
        wine.country ?? "",
        wine.wineCategory ?? "",
        wine.assortment ?? "",
        ...(wine.assortmentGrades ?? []),
      ].join(" ")
    }
    searchFields={(wine) => [
      wine.name,
      wine.productNumber,
      wine.country ?? "",
      wine.wineCategory ?? "",
      wine.assortment ?? "",
      ...(wine.assortmentGrades ?? []),
    ]}
    pageSize={1_000}
    load={(apiKey, values, signal) => api.getWines(apiKey, values, signal)}
    sortItems={(left, right) =>
      (right.availability.bottlesByDate.at(-1)?.count ?? 0) -
        (left.availability.bottlesByDate.at(-1)?.count ?? 0) ||
      right.availability.inStockAtSomePoint - left.availability.inStockAtSomePoint ||
      right.availability.currentlyInStock - left.availability.currentlyInStock ||
      left.name.localeCompare(right.name, "en")
    }
    renderItem={(wine, period) => <WineRow key={wine.id} wine={wine} period={period} />}
  />
);
