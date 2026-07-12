import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Period, WineCatalogItem } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

const WineRow = ({ wine, period }: { wine: WineCatalogItem; period: Period }) => {
  const href = `/wines/${wine.id}?from=${period.from}&to=${period.to}`;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="grid gap-5 py-1 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
        <div className="min-w-0">
          <Badge variant="secondary">Product {wine.productNumber}</Badge>
          <h2 className="mt-2 truncate text-base font-medium">
            <Link to={href}>{wine.name}</Link>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {wine.country || "Country not listed"}
          </p>
        </div>
        <BottleHistory inventory={wine.availability.bottlesByDate} label={wine.name} />
        <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
          <Link to={href} aria-label={`Open ${wine.name}`}>
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export const WinesPage = () => (
  <CatalogBrowser
    kind="wines"
    title="Wines"
    description="Find a product and compare its daily stock history across Vinmonopolet stores."
    searchLabel="Search wines"
    searchPlaceholder="Wine name or product number"
    emptyTitle="No wines found"
    emptyDescription="Try another wine name or product number."
    pageSize={1_000}
    load={(apiKey, values, signal) => api.getWines(apiKey, values, signal)}
    sortItems={(left, right) =>
      right.availability.inStockAtSomePoint - left.availability.inStockAtSomePoint ||
      right.availability.currentlyInStock - left.availability.currentlyInStock ||
      left.name.localeCompare(right.name, "en")
    }
    renderItem={(wine, period) => <WineRow key={wine.id} wine={wine} period={period} />}
  />
);
