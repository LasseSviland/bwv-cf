import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolyCatalogItem, Period } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { Button } from "../components/ui/button";

const MonopolyRow = ({ monopoly, period }: { monopoly: MonopolyCatalogItem; period: Period }) => {
  const href = `/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`;
  return (
    <div className="grid gap-2 py-5 md:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.45fr)_auto] md:items-center">
      <div className="min-w-0">
        <h2 className="mt-2 truncate text-base font-medium">
          <Link to={href} title={monopoly.name}>
            {monopoly.name}
          </Link>
        </h2>
        {monopoly.monopolyCategory ? (
          <p className="mt-1 text-xs text-muted-foreground">Category {monopoly.monopolyCategory}</p>
        ) : null}
      </div>
      <BottleHistory inventory={monopoly.availability.bottlesByDate} label={monopoly.name} />
      <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
        <Link to={href} aria-label={`Open ${monopoly.name}`}>
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
};

export const MonopoliesPage = () => (
  <CatalogBrowser<MonopolyCatalogItem>
    kind="monopolies"
    title="Monopolies"
    searchLabel="Search monopolies"
    searchPlaceholder="Search by store name, number, postcode, city or category"
    emptyTitle="No monopolies found"
    emptyDescription="Try another store name, number, postcode or city."
    itemKey={(monopoly) => monopoly.id}
    searchText={(monopoly) =>
      [
        monopoly.name,
        monopoly.storeNumber,
        monopoly.postalCode ?? "",
        monopoly.city ?? "",
        monopoly.monopolyCategory ?? "",
      ].join(" ")
    }
    searchFields={(monopoly) => [
      monopoly.name,
      monopoly.storeNumber,
      monopoly.postalCode ?? "",
      monopoly.city ?? "",
      monopoly.monopolyCategory ?? "",
    ]}
    load={(apiKey, values, signal) => api.getMonopolies(apiKey, values, signal)}
    sortItems={(left, right) =>
      (right.availability.bottlesByDate.at(-1)?.count ?? 0) -
        (left.availability.bottlesByDate.at(-1)?.count ?? 0) ||
      right.availability.inStockAtSomePoint - left.availability.inStockAtSomePoint ||
      right.availability.currentlyInStock - left.availability.currentlyInStock ||
      left.name.localeCompare(right.name, "nb-NO")
    }
    renderItem={(monopoly, period) => (
      <MonopolyRow key={monopoly.id} monopoly={monopoly} period={period} />
    )}
  />
);
