import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Period, WineCatalogItem } from "../api/types";
import { CatalogBrowser } from "../components/CatalogBrowser";

const WineRow = ({ wine, period }: { wine: WineCatalogItem; period: Period }) => {
  const href = `/wines/${wine.id}?from=${period.from}&to=${period.to}`;
  return (
    <article className="catalog-row">
      <div className="catalog-row__identity">
        <p className="catalog-card__meta">Product {wine.productNumber}</p>
        <h2>
          <Link to={href}>{wine.name}</Link>
        </h2>
        <p>{wine.country || "Country not listed"}</p>
      </div>
      <div className="catalog-row__stats" aria-label={`Stock summary for ${wine.name}`}>
        <span>
          <strong>{wine.availability.soldOutAtSomePoint}</strong> stores sold out
        </span>
        <span>
          <strong>{wine.availability.inStockAtSomePoint}</strong> stores in stock
        </span>
        <span>
          <strong>{wine.availability.currentlyInStock}</strong> in stock now
        </span>
      </div>
      <Link className="catalog-card__arrow" to={href} aria-label={`Open ${wine.name}`}>
        →
      </Link>
    </article>
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
    load={(apiKey, values, signal) => api.getWines(apiKey, values, signal)}
    renderItem={(wine, period) => <WineRow key={wine.id} wine={wine} period={period} />}
  />
);
