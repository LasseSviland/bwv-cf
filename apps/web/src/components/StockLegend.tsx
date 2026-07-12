export const StockLegend = () => (
  <div className="stock-legend" aria-label="Availability legend">
    <span className="stock-legend__item">
      <span className="stock-swatch stock-swatch--in" aria-hidden="true">
        4
      </span>
      In stock · number is bottle count
    </span>
    <span className="stock-legend__item">
      <span className="stock-swatch stock-swatch--out" aria-hidden="true">
        —
      </span>
      Sold out
    </span>
    <span className="stock-legend__item">
      <span className="stock-swatch stock-swatch--unknown" aria-hidden="true">
        ?
      </span>
      Data unavailable
    </span>
  </div>
);
