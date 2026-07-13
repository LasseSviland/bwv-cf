import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Statistics", end: true },
  { to: "/wines", label: "Wines" },
  { to: "/monopolies", label: "Monopolies" },
  { to: "/settings", label: "Settings" },
] as const;

export interface AppShellOutletContext {
  setHeaderContent: (content: ReactNode) => void;
}

export const AppShell = () => {
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/80">
        <div className="mx-auto flex min-h-14 w-full max-w-400 items-center justify-between gap-4 px-3 sm:px-5 lg:px-8">
          <div className="min-w-0">{headerContent}</div>
          <nav className="flex shrink-0 items-center gap-5" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                className={({ isActive }) =>
                  cn(
                    "border-b border-transparent px-0.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm",
                    isActive && "border-primary text-primary",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-400 px-3 py-6 sm:px-4 sm:py-8 lg:px-5 lg:py-10"
        id="main-content"
      >
        <Outlet context={{ setHeaderContent }} />
      </main>
    </div>
  );
};
