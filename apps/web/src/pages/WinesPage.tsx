import { ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Period, WineCatalogItem } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { Button } from "../components/ui/button";

const WineRow = ({ wine, period }: { wine: WineCatalogItem; period: Period }) => {
  const href = `/wines/${wine.id}?from=${period.from}&to=${period.to}`;
  return (
    <div className="grid gap-2 py-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0">
        <h2 className="mt-2 flex items-center gap-1 text-base font-medium">
          <Link className="min-w-0 truncate" to={href}>
            {wine.name}
          </Link>
          <details className="relative shrink-0">
            <summary
              className="grid size-5 cursor-pointer list-none place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`More information about ${wine.name}`}
            >
              <Info className="size-3.5" />
            </summary>
            <div className="absolute left-0 top-7 z-10 w-56 rounded-lg border bg-card p-3 text-xs font-normal shadow-lg">
              <p>
                <strong>Product number:</strong> {wine.productNumber}
              </p>
              {wine.country ? (
                <p className="mt-1">
                  <strong>Country:</strong> {wine.country}
                </p>
              ) : null}
            </div>
          </details>
        </h2>
      </div>
      <BottleHistory inventory={wine.availability.bottlesByDate} label={wine.name} />
      <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
        <Link to={href} aria-label={`Open ${wine.name}`}>
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
};

export const WinesPage = () => (
  <CatalogBrowser<WineCatalogItem>
    kind="wines"
    title="Wines"
    searchLabel="Search wines"
    searchPlaceholder="Search by wine name or product number"
    emptyTitle="No wines found"
    emptyDescription="Try another wine name or product number."
    searchText={(wine) => [wine.name, wine.productNumber, wine.country ?? ""].join(" ")}
    searchFields={(wine) => [wine.name, wine.productNumber, wine.country ?? ""]}
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
