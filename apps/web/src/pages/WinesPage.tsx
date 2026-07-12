import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { WineSummary } from "../api/types";
import { CatalogBrowser } from "../components/CatalogBrowser";

const WineCard = ({ wine }: { wine: WineSummary }) => (
  <article className="catalog-card">
    <div className="catalog-card__mark catalog-card__mark--wine" aria-hidden="true">
      W
    </div>
    <div className="catalog-card__body">
      <p className="catalog-card__meta">Product {wine.productNumber}</p>
      <h2>
        <Link to={`/wines/${wine.id}`}>{wine.name}</Link>
      </h2>
      <p>{wine.country || "Country not listed"}</p>
    </div>
    <Link className="catalog-card__arrow" to={`/wines/${wine.id}`} aria-label={`Open ${wine.name}`}>
      →
    </Link>
  </article>
);

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
    renderItem={(wine) => <WineCard key={wine.id} wine={wine} />}
  />
);
