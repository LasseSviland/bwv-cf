import { ArrowRight } from "lucide-react";
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
    <div className="grid gap-2 py-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0">
        <h2 className="mt-2 flex items-center gap-1 text-base font-medium">
          <Link className="min-w-0 truncate" to={href} title={wine.name}>
            {wine.name}
          </Link>
        </h2>
      </div>
      <BottleHistory inventory={wine.availability.bottlesByDate} label={wine.name} />
      <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
        <Link to={href} aria-label={`Open ${wine.name}`}>
          <ArrowRight />
        </Link>
      </Button>
      <EntityMoreInfo
        className="md:col-span-3"
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
