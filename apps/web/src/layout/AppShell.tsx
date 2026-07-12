import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const navItems = [
  { to: "/", label: "Statistics", end: true },
  { to: "/wines", label: "Wines" },
  { to: "/monopolies", label: "Monopolies" },
] as const;

export const AppShell = () => {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-brand" to="/" aria-label="Better Wines overview">
          <span className="app-brand__mark" aria-hidden="true">
            BW
          </span>
          <span>
            <strong>Better Wines</strong>
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
