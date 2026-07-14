import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '@bliver/ui';

const destinations = [
  { href: '/map', label: 'Map' },
  { href: '/activity', label: 'Activity' },
  { href: '/messages', label: 'Messages' },
  { href: '/me', label: 'My space' },
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <a className="app-shell__brand" href="/map">
          Bliver
        </a>
        <Button aria-label="Publish footprint" variant="primary">
          Publish
        </Button>
      </header>
      <main className="app-shell__main" id="main-content">
        <Outlet />
      </main>
      <nav aria-label="Primary navigation" className="app-shell__nav">
        {destinations.map((destination) => (
          <NavLink
            key={destination.href}
            to={destination.href}
            className={({ isActive }) =>
              isActive ? 'app-shell__nav-link is-active' : 'app-shell__nav-link'
            }
          >
            {destination.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
