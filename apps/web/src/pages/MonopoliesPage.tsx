import { ArrowRight, Hash, MapPin, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolyCatalogItem, Period } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";
import { EntityMoreInfo } from "../components/EntityMoreInfo";
import { Button } from "../components/ui/button";

const MonopolyRow = ({ monopoly, period }: { monopoly: MonopolyCatalogItem; period: Period }) => {
  const href = `/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`;
  return (
    <div className="grid gap-5 py-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)_auto] lg:items-center lg:py-7">
      <div className="min-w-0">
        <p className="mb-2 text-[0.62rem] font-semibold tracking-[0.14em] text-primary/65 uppercase">
          Vinmonopolet store
        </p>
        <h2 className="font-serif text-2xl leading-tight font-normal tracking-[-0.025em]">
          <Link className="transition-colors hover:text-primary/70" to={href} title={monopoly.name}>
            {monopoly.name}
          </Link>
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Hash className="size-3" aria-hidden="true" /> Store {monopoly.storeNumber}
          </span>
          {monopoly.city ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3" aria-hidden="true" />
              {[monopoly.postalCode, monopoly.city].filter(Boolean).join(" ")}
            </span>
          ) : null}
          {monopoly.monopolyCategory ? (
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="size-3" aria-hidden="true" /> Category{" "}
              {monopoly.monopolyCategory}
              {monopoly.monopolyProfile ? ` · ${monopoly.monopolyProfile}` : ""}
            </span>
          ) : null}
        </div>
      </div>
      <BottleHistory inventory={monopoly.availability.bottlesByDate} label={monopoly.name} />
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className="hidden rounded-full border border-border/70 bg-background/50 lg:inline-flex"
      >
        <Link to={href} aria-label={`Open ${monopoly.name}`}>
          <ArrowRight />
        </Link>
      </Button>
      <EntityMoreInfo
        className="lg:col-span-3"
        kind="monopoly"
        entityId={String(monopoly.id)}
        label={monopoly.name}
      />
    </div>
  );
};

export const MonopoliesPage = () => (
  <CatalogBrowser<MonopolyCatalogItem>
    kind="monopolies"
    title="Stores"
    description="See every Vinmonopolet location at a glance, from assortment profile to daily portfolio stock."
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
        monopoly.monopolyProfile ?? "",
        monopoly.storeAssortment ?? "",
      ].join(" ")
    }
    searchFields={(monopoly) => [
      monopoly.name,
      monopoly.storeNumber,
      monopoly.postalCode ?? "",
      monopoly.city ?? "",
      monopoly.monopolyCategory ?? "",
      monopoly.monopolyProfile ?? "",
      monopoly.storeAssortment ?? "",
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
