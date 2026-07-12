import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Statistics", end: true },
  { to: "/wines", label: "Wines" },
  { to: "/monopolies", label: "Monopolies" },
] as const;

export const AppShell = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 shadow-sm backdrop-blur-xl">
        <div className="mx-auto grid min-h-18 w-full max-w-400 grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-8 lg:px-14">
          <NavLink
            className="flex items-center gap-2.5 justify-self-start text-primary no-underline"
            to="/"
            aria-label="Better Wines overview"
          >
            <span
              className="grid size-10 place-items-center rounded-full bg-primary font-serif text-xs tracking-[0.12em] text-primary-foreground"
              aria-hidden="true"
            >
              BW
            </span>
            <strong className="hidden text-sm font-semibold sm:block">Better Wines</strong>
          </NavLink>

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

          <Button
            className="justify-self-end"
            variant="ghost"
            size="sm"
            type="button"
            onClick={logout}
            aria-label="Log out"
          >
            <LogOut data-icon="inline-start" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-400 px-4 py-8 sm:px-8 sm:py-12 lg:px-16 lg:py-16"
        id="main-content"
      >
        <Outlet />
      </main>
    </div>
  );
};
