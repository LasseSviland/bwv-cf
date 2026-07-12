import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader = ({ eyebrow, title, description, actions }: PageHeaderProps) => (
  <header className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
    <div className="min-w-0">
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-serif text-4xl leading-none font-normal tracking-tight text-balance sm:text-6xl lg:text-7xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </header>
);
