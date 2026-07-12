import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { formatDate, formatDateTime } from "../utils/dates";

export const HomePage = () => {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [wineQuery, setWineQuery] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const freshness = status?.freshness;

  const search = (event: FormEvent, path: string, query: string) => {
    event.preventDefault();
    navigate(query.trim() ? `${path}?q=${encodeURIComponent(query.trim())}` : path);
  };

  return (
    <div className="home-page">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="eyebrow">Daily Vinmonopolet inventory</p>
          <h1>See exactly when a wine was available — and when it sold out.</h1>
          <p>
            Search any wine or monopoly, choose a period, and scan every morning’s stock count in
            one clear timeline.
          </p>
        </div>
        <div className="hero-panel__motif" aria-hidden="true">
          <span className="motif-bottle">BW</span>
          <span className="motif-orbit motif-orbit--one" />
          <span className="motif-orbit motif-orbit--two" />
        </div>
      </section>

      <section className="search-choice" aria-labelledby="start-searching">
        <div className="section-heading">
          <p className="eyebrow">Start exploring</p>
          <h2 id="start-searching">What do you want to look up?</h2>
        </div>
        <div className="search-choice__grid">
          <form
            className="search-card search-card--wine"
            onSubmit={(event) => search(event, "/wines", wineQuery)}
          >
            <span className="search-card__number" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Find a wine</h3>
              <p>Compare daily availability across every store that carried it.</p>
            </div>
            <label htmlFor="home-wine-search">Wine name or product number</label>
            <div className="search-card__input">
              <input
                id="home-wine-search"
                type="search"
                placeholder="e.g. Barolo or 123456"
                value={wineQuery}
                onChange={(event) => setWineQuery(event.target.value)}
              />
              <button className="button button--primary" type="submit">
                Search wines
              </button>
            </div>
          </form>

          <form
            className="search-card search-card--store"
            onSubmit={(event) => search(event, "/monopolies", storeQuery)}
          >
            <span className="search-card__number" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Find a monopoly</h3>
              <p>See all wines and the exact stock history at one location.</p>
            </div>
            <label htmlFor="home-store-search">Store name, number or city</label>
            <div className="search-card__input">
              <input
                id="home-store-search"
                type="search"
                placeholder="e.g. Oslo, Majorstuen"
                value={storeQuery}
                onChange={(event) => setStoreQuery(event.target.value)}
              />
              <button className="button button--primary" type="submit">
                Search stores
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="home-status" aria-label="Current dataset status">
        <div>
          <p className="eyebrow">Inventory coverage</p>
          <h2>
            {freshness
              ? `Through ${formatDate(freshness.coveredThrough)}`
              : "Preparing inventory data"}
          </h2>
          <p>
            {freshness
              ? `Latest dataset generated ${formatDateTime(freshness.datasetGeneratedAt)}.`
              : "Historic months will appear here as they are published."}
          </p>
        </div>
        <div className="home-status__metrics">
          <div>
            <strong>{status?.availableMonths.length ?? 0}</strong>
            <span>months available</span>
          </div>
          <Link className="button button--secondary" to="/status">
            View data status
          </Link>
        </div>
      </section>
    </div>
  );
};
