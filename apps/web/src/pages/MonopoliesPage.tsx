import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolyCatalogItem, Period } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

const MonopolyRow = ({ monopoly, period }: { monopoly: MonopolyCatalogItem; period: Period }) => {
  const location = [monopoly.postalCode, monopoly.city].filter(Boolean).join(" ");
  const href = `/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="grid gap-5 py-1 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
        <div className="min-w-0">
          <Badge variant="secondary">Store {monopoly.storeNumber}</Badge>
          <h2 className="mt-2 truncate text-base font-medium">
            <Link to={href}>{monopoly.name}</Link>
          </h2>
          {location ? <p className="mt-1 text-sm text-muted-foreground">{location}</p> : null}
        </div>
        <BottleHistory inventory={monopoly.availability.bottlesByDate} label={monopoly.name} />
        <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
          <Link to={href} aria-label={`Open ${monopoly.name}`}>
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export const MonopoliesPage = () => (
  <CatalogBrowser
    kind="monopolies"
    title="Monopolies"
    description="Choose a store to see every wine and its complete daily stock history."
    searchLabel="Search monopolies"
    searchPlaceholder="Store name, number, postcode or city"
    emptyTitle="No monopolies found"
    emptyDescription="Try another store name, number, postcode or city."
    load={(apiKey, values, signal) => api.getMonopolies(apiKey, values, signal)}
    sortItems={(left, right) =>
      right.availability.inStockAtSomePoint - left.availability.inStockAtSomePoint ||
      right.availability.currentlyInStock - left.availability.currentlyInStock ||
      left.name.localeCompare(right.name, "nb-NO")
    }
    renderItem={(monopoly, period) => (
      <MonopolyRow key={monopoly.id} monopoly={monopoly} period={period} />
    )}
  />
);
