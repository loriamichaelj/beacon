import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">Beacon</span>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/services" className={navClass}>
            Services
          </NavLink>
          <NavLink to="/incidents" className={navClass}>
            Incidents
          </NavLink>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
