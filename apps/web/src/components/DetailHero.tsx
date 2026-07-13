import type { ReactNode } from "react";

export interface DetailMetric {
  label: string;
  value: ReactNode;
  detail?: string;
}

interface DetailHeroProps {
  eyebrow: string;
  title: string;
  metadata: ReactNode;
  metrics: DetailMetric[];
  children?: ReactNode;
}

export const DetailHero = ({ eyebrow, title, metadata, metrics, children }: DetailHeroProps) => (
  <section className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-5 py-7 text-primary-foreground shadow-[0_28px_80px_rgb(21_61_45/18%)] sm:px-8 sm:py-9 lg:px-12 lg:py-12">
    <div
      className="pointer-events-none absolute inset-0 -z-10 opacity-80"
      style={{
        background:
          "radial-gradient(circle at 86% 2%, rgba(255,255,255,.16), transparent 32rem), radial-gradient(circle at 8% 100%, rgba(189,216,199,.13), transparent 28rem)",
      }}
    />
    <div className="max-w-5xl">
      <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-white/58 uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-serif text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.94] font-normal tracking-[-0.045em] text-balance">
        {title}
      </h1>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/68">
        {metadata}
      </div>
    </div>

    <div className="mt-9 grid border-t border-white/15 pt-6 sm:grid-cols-3 sm:divide-x sm:divide-white/15 lg:mt-12">
      {metrics.map((metric, index) => (
        <div className={`py-3 ${index === 0 ? "sm:pr-8" : "sm:px-8"}`} key={metric.label}>
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-white/50 uppercase">
            {metric.label}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {metric.value}
          </p>
          {metric.detail ? <p className="mt-1 text-xs text-white/52">{metric.detail}</p> : null}
        </div>
      ))}
    </div>
    {children ? <div className="mt-5 border-t border-white/15 pt-5">{children}</div> : null}
  </section>
);
