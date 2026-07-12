import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { formatDate } from "../utils/dates";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/wines", label: "Wines" },
  { to: "/monopolies", label: "Monopolies" },
  { to: "/status", label: "Data status" },
] as const;

export const AppShell = () => {
  const { logout, status } = useAuth();
  const coveredThrough = status?.freshness?.coveredThrough;

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-brand" to="/" aria-label="Better Wines overview">
          <span className="app-brand__mark" aria-hidden="true">
            BW
          </span>
          <span>
            <strong>Better Wines</strong>
            <small>Inventory history</small>
          </span>
        </NavLink>

        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : undefined}
              className={({ isActive }) =>
                isActive ? "primary-nav__link is-active" : "primary-nav__link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          {coveredThrough ? (
            <span
              className="coverage-chip"
              title={`Inventory covered through ${formatDate(coveredThrough)}`}
            >
              <span className="coverage-chip__dot" aria-hidden="true" />
              Through {formatDate(coveredThrough, { day: "numeric", month: "short" })}
            </span>
          ) : null}
          <button className="button button--quiet" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="app-content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
};
