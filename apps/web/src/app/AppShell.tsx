import { geoPoint } from '@bliver/contracts';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@bliver/ui';

const destinations = [
  { href: '/map', label: 'Map' },
  { href: '/activity', label: 'Activity' },
  { href: '/messages', label: 'Messages' },
  { href: '/me', label: 'My space' },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const publish = (): void => { const params = new URLSearchParams(location.search); const lat = params.get('lat'); const lng = params.get('lng'); const point = lat !== null && lng !== null ? geoPoint.safeParse({ lat: Number(lat), lng: Number(lng) }).data : undefined; navigate('/publish', point ? { state: { initialPoint: point } } : undefined); };
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <a className="app-shell__brand" href="/map">
          Bliver
        </a>
        <Button aria-label="Publish footprint" variant="primary" onClick={publish}>
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
