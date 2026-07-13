import { BarChart3, Settings, Store, Wine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Overview", icon: BarChart3, end: true },
  { to: "/wines", label: "Wines", icon: Wine },
  { to: "/monopolies", label: "Stores", icon: Store },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export interface AppShellOutletContext {
  setHeaderContent: (content: ReactNode) => void;
}

export const AppShell = () => {
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-400 items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              className="group flex shrink-0 items-center gap-2.5"
              aria-label="Better Wines home"
            >
              <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                <Wine className="size-4" aria-hidden="true" />
              </span>
              <span className="hidden leading-none sm:block">
                <strong className="block font-serif text-[0.95rem] font-normal tracking-tight">
                  Better Wines
                </strong>
                <span className="mt-1 block text-[0.58rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                  Portfolio intelligence
                </span>
              </span>
            </Link>
            {headerContent ? (
              <div className="hidden min-w-0 border-l border-border pl-4 lg:block">
                {headerContent}
              </div>
            ) : null}
          </div>
          <nav
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-card/85 p-1 shadow-[0_1px_0_rgb(255_255_255/80%),0_8px_24px_rgb(21_61_45/5%)]"
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground sm:px-3",
                    isActive &&
                      "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
                  )
                }
              >
                <item.icon className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-400 px-3 py-7 sm:px-5 sm:py-10 lg:px-8 lg:py-14"
        id="main-content"
      >
        <Outlet context={{ setHeaderContent }} />
      </main>
    </div>
  );
};
