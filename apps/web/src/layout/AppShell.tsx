import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Statistics", end: true },
  { to: "/wines", label: "Wines" },
  { to: "/monopolies", label: "Monopolies" },
] as const;

export const AppShell = () => (
  <div className="min-h-screen">
    <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex min-h-18 w-full max-w-400 items-center justify-center gap-4 px-4 sm:px-8 lg:px-14">
        <nav
          className="flex items-center gap-1 rounded-xl border bg-muted/70 p-1"
          aria-label="Main navigation"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : undefined}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3 sm:text-sm",
                  isActive && "bg-card text-primary shadow-sm",
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
      className="mx-auto w-full max-w-400 px-3 py-8 sm:px-5 sm:py-12 lg:px-8 lg:py-16"
      id="main-content"
    >
      <Outlet />
    </main>
  </div>
);
