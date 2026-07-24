import { BarChart3, Store, Wine } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  {
    to: "/",
    label: "Statistics",
    icon: BarChart3,
    end: true,
    preload: () => import("../pages/HomePage"),
  },
  {
    to: "/wines",
    label: "Wines",
    icon: Wine,
    preload: () => import("../pages/WinesPage"),
  },
  {
    to: "/monopolies",
    label: "Stores",
    icon: Store,
    preload: () => import("../pages/MonopoliesPage"),
  },
] as const;

export interface AppShellOutletContext {
  setHeaderContent: (content: ReactNode) => void;
}

export const AppShell = () => {
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);
  const { pathname } = useLocation();
  const activeNavItem = navItems.find((item) =>
    item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const isTopLevelPage = activeNavItem?.to === pathname;

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-400 min-w-0 items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            {activeNavItem ? (
              isTopLevelPage ? (
                <h1 className="truncate font-serif text-2xl leading-none font-normal tracking-[-0.03em] sm:hidden">
                  {activeNavItem.label}
                </h1>
              ) : (
                <span className="truncate font-serif text-2xl leading-none font-normal tracking-[-0.03em] sm:hidden">
                  {activeNavItem.label}
                </span>
              )
            ) : null}
            {headerContent ? <div className="hidden min-w-0 sm:block">{headerContent}</div> : null}
          </div>
          <nav
            className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-card p-1 shadow-[0_1px_0_rgb(255_255_255/80%),0_8px_24px_rgb(21_61_45/5%)]"
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                aria-label={item.label}
                title={item.label}
                onFocus={() => void item.preload()}
                onMouseEnter={() => void item.preload()}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground sm:h-8",
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
        className="mx-auto w-full max-w-400 min-w-0 px-3 py-7 sm:px-5 sm:py-10 lg:px-8 lg:py-14"
        id="main-content"
      >
        <Outlet context={{ setHeaderContent }} />
      </main>
    </div>
  );
};
