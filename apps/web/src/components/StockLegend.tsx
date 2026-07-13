import { Badge } from "./ui/badge";

interface StockLegendProps {
  showAdditional?: boolean;
  showUnknown?: boolean;
}

export const StockLegend = ({ showAdditional = false, showUnknown = false }: StockLegendProps) => (
  <div
    className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    aria-label="Availability legend"
  >
    <span className="inline-flex items-center gap-1.5">
      <Badge
        className="min-w-7 bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
        aria-hidden="true"
      >
        4
      </Badge>
      In stock · number is bottle count
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Badge className="min-w-7 bg-rose-100 text-rose-900 hover:bg-rose-100" aria-hidden="true">
        —
      </Badge>
      Sold out
    </span>
    {showAdditional ? (
      <span className="inline-flex items-center gap-1.5">
        <Badge className="min-w-7 bg-sky-100 text-sky-900 hover:bg-sky-100" aria-hidden="true">
          A
        </Badge>
        Additional product · optional local stock
      </span>
    ) : null}
    {showUnknown ? (
      <span className="inline-flex items-center gap-1.5">
        <Badge
          className="min-w-7 bg-amber-100 text-amber-900 hover:bg-amber-100"
          aria-hidden="true"
        >
          i
        </Badge>
        Assortment not classified
      </span>
    ) : null}
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className="min-w-7 border-dashed bg-muted/70" aria-hidden="true">
        ?
      </Badge>
      Data unavailable
    </span>
  </div>
);
