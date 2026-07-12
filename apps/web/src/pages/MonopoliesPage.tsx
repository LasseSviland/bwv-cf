import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonopolySummary } from "../api/types";
import { CatalogBrowser } from "../components/CatalogBrowser";

const MonopolyCard = ({ monopoly }: { monopoly: MonopolySummary }) => {
  const location = [monopoly.postalCode, monopoly.city].filter(Boolean).join(" ");
  return (
    <article className="catalog-card">
      <div className="catalog-card__mark catalog-card__mark--store" aria-hidden="true">
        M
      </div>
      <div className="catalog-card__body">
        <p className="catalog-card__meta">Store {monopoly.storeNumber}</p>
        <h2>
          <Link to={`/monopolies/${monopoly.id}`}>{monopoly.name}</Link>
        </h2>
        <p>{location || "Location not listed"}</p>
      </div>
      <Link
        className="catalog-card__arrow"
        to={`/monopolies/${monopoly.id}`}
        aria-label={`Open ${monopoly.name}`}
      >
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
    renderItem={(monopoly) => <MonopolyCard key={monopoly.id} monopoly={monopoly} />}
  />
);
