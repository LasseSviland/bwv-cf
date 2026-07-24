import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) => (
  <header
    className={cn(
      "flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end",
      className,
    )}
  >
    <div className="min-w-0">
      {eyebrow ? (
        <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.18em] text-primary/75 uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-serif text-4xl leading-[0.98] font-normal tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.5rem]">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </header>
);
