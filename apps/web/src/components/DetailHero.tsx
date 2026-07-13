import type { ReactNode } from "react";

export interface DetailMetric {
  label: string;
  value: ReactNode;
  detail?: string;
}

interface DetailHeroProps {
  title: string;
  byline?: ReactNode;
  metrics?: DetailMetric[];
  summary?: ReactNode;
}

export const DetailHero = ({ title, byline, metrics = [], summary }: DetailHeroProps) => (
  <section>
    <div className="max-w-5xl">
      <h1 className="font-serif text-[clamp(2.5rem,6vw,5rem)] leading-[0.96] font-normal tracking-[-0.045em] text-balance">
        {title}
      </h1>
      {byline ? <div className="mt-3 text-sm text-muted-foreground">{byline}</div> : null}
      {summary ? <div className="mt-5">{summary}</div> : null}
    </div>

    {metrics.length ? (
      <div className="mt-7 grid border-y border-border/75 py-3 sm:grid-cols-3 sm:divide-x sm:divide-border/75">
        {metrics.map((metric, index) => (
          <div className={`py-3 ${index === 0 ? "sm:pr-8" : "sm:px-8"}`} key={metric.label}>
            <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              {metric.value}
            </p>
            {metric.detail ? (
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
    ) : null}
  </section>
);
