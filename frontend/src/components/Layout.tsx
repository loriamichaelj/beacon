import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { useActiveIncidentCount } from "../api/incidents";
import { BeaconLogo, Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export function Layout({ children }: { children: ReactNode }) {
  const active = useActiveIncidentCount();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-brand" aria-label="Beacon home">
            <BeaconLogo />
            <span>Beacon</span>
          </Link>
          <nav className="app-nav" aria-label="Primary">
            <NavLink to="/" end className={navClass}>
              <Icon name="overview" />
              Overview
            </NavLink>
            <NavLink to="/services" className={navClass}>
              <Icon name="services" />
              Services
            </NavLink>
            <NavLink to="/incidents" className={navClass}>
              <Icon name="incidents" />
              Incidents
              {active.data ? (
                <span className="nav-count" title={`${active.data} unresolved`}>
                  {active.data}
                  <span className="visually-hidden"> unresolved</span>
                </span>
              ) : null}
            </NavLink>
          </nav>
          <div className="app-header-actions">
            <ThemeToggle />
            <Link to="/incidents/new" className="button button-primary button-small">
              <Icon name="plus" />
              <span className="hide-narrow">Report incident</span>
              <span className="show-narrow">Report</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
    </div>
  );
}
