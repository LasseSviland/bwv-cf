import { BarChart3, Store, Wine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-400 items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center">
            {headerContent ? <div className="hidden min-w-0 lg:block">{headerContent}</div> : null}
          </div>
          <nav
            className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-card/85 p-1 shadow-[0_1px_0_rgb(255_255_255/80%),0_8px_24px_rgb(21_61_45/5%)]"
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                onFocus={() => void item.preload()}
                onMouseEnter={() => void item.preload()}
                className={({ isActive }) =>
                  cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground sm:px-3",
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
