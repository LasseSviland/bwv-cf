interface StockLegendProps {
  showInStock?: boolean;
  showSoldOut?: boolean;
  showAdditional?: boolean;
  showUnknown?: boolean;
  showUnavailable?: boolean;
}

export const StockLegend = ({
  showInStock = false,
  showSoldOut = false,
  showAdditional = false,
  showUnknown = false,
  showUnavailable = false,
}: StockLegendProps) => (
  <div
    className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
    aria-label="Availability legend"
  >
    {showInStock ? (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100"
          aria-hidden="true"
        />
        In stock · number is bottle count
      </span>
    ) : null}
    {showSoldOut ? (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-rose-400 ring-4 ring-rose-100"
          aria-hidden="true"
        />
        Sold out
      </span>
    ) : null}
    {showAdditional ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-sky-400 ring-4 ring-sky-100" aria-hidden="true" />
        Additional product · optional local stock
      </span>
    ) : null}
    {showUnknown ? (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-amber-400 ring-4 ring-amber-100"
          aria-hidden="true"
        />
        Assortment not classified
      </span>
    ) : null}
    {showUnavailable ? (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full border border-dashed border-muted-foreground/50 bg-muted"
          aria-hidden="true"
        />
        Data unavailable
      </span>
    ) : null}
  </div>
);
