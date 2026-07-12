import { Badge } from "./ui/badge";

export const StockLegend = () => (
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
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className="min-w-7 border-dashed" aria-hidden="true">
        ?
      </Badge>
      Data unavailable
    </span>
  </div>
);
