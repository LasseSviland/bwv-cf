import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolyCatalogItem, Period } from "../api/types";
import { BottleHistory } from "../components/BottleHistory";
import { CatalogBrowser } from "../components/CatalogBrowser";

const MonopolyRow = ({ monopoly, period }: { monopoly: MonopolyCatalogItem; period: Period }) => {
  const location = [monopoly.postalCode, monopoly.city].filter(Boolean).join(" ");
  const href = `/monopolies/${monopoly.id}?from=${period.from}&to=${period.to}`;
  return (
    <article className="catalog-row">
      <div className="catalog-row__identity">
        <p className="catalog-card__meta">Store {monopoly.storeNumber}</p>
        <h2>
          <Link to={href}>{monopoly.name}</Link>
        </h2>
        {location ? <p>{location}</p> : null}
      </div>
      <BottleHistory inventory={monopoly.availability.bottlesByDate} label={monopoly.name} />
      <Link className="catalog-card__arrow" to={href} aria-label={`Open ${monopoly.name}`}>
        →
      </Link>
    </article>
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
