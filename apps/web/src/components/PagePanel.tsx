import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const PagePanel = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    {...props}
    data-slot="page-panel"
    className={cn(
      "min-w-0 rounded-xl border border-border/80 bg-card shadow-[0_18px_55px_rgb(31_45_37/5%)]",
      className,
    )}
  />
);
