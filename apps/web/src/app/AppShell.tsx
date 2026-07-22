import { Button } from '@bliver/ui';
import {
  Bell,
  Compass,
  Map,
  MessageCircle,
  Plus,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { LocaleSwitcher } from './LocaleSwitcher.js';
import { RouteSceneDirector } from './SceneDirector.js';
import './app-shell.css';

const destinations = [
  { href: '/map', key: 'nav.map', Icon: Map },
  { href: '/activity', key: 'nav.activity', Icon: Compass },
  { href: '/messages', key: 'nav.messages', Icon: MessageCircle },
  { href: '/me', key: 'nav.me', Icon: UserRound },
] as const;

const workPrefixes = ['/messages', '/notifications', '/people', '/admin'];
const storyPrefixes = ['/activity', '/footprints', '/me', '/profile'];
const authPrefixes = ['/login', '/session-expired'];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function pointFromSearch(search: string):
  | { readonly lat: number; readonly lng: number }
  | undefined {
  const params = new URLSearchParams(search);
  const latParam = params.get('lat');
  const lngParam = params.get('lng');

  if (latParam === null || lngParam === null) return undefined;

  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return undefined;
  }

  return { lat, lng };
}

export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const spatial = location.pathname === '/map' || location.pathname === '/publish';
  const work = matchesPrefix(location.pathname, workPrefixes);
  const story = matchesPrefix(location.pathname, storyPrefixes);
  const auth = matchesPrefix(location.pathname, authPrefixes);
  const routeId = location.pathname.split('/')[1] || 'map';
  const publishing = routeId === 'publish';

  const contextKey = ([
    ['/activity', 'nav.activity'],
    ['/messages', 'nav.messages'],
    ['/people', 'nav.people'],
    ['/admin', 'nav.admin'],
    ['/login', 'session.signIn'],
    ['/footprints', 'map.preview'],
    ['/me', 'nav.me'],
    ['/profile', 'nav.me'],
    ['/notifications', 'common.notifications'],
    ['/publish', 'actions.publish'],
    ['/session-expired', 'session.signIn'],
  ] as const).find(([prefix]) => location.pathname.startsWith(prefix))?.[1]
    ?? 'nav.map';
  const publishLabel = t('actions.publish');

  const publish = (): void => {
    const point = pointFromSearch(location.search);

    navigate(
      { pathname: '/publish', search: location.search },
      point ? { state: { initialPoint: point } } : undefined,
    );
  };

  return (
    <div
      data-route={routeId}
      data-scene={spatial ? 'spatial' : work ? 'work' : story ? 'story' : auth ? 'auth' : 'content'}
      className={spatial
        ? 'app-shell app-shell--spatial'
          : work
            ? 'app-shell app-shell--work'
          : story
            ? 'app-shell app-shell--story'
            : auth
              ? 'app-shell app-shell--auth'
            : 'app-shell app-shell--content'}
    >
      <a className="app-shell__skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <header className="app-shell__header">
        <Link className="app-shell__brand" to="/map">
          {t('common.brand')}
        </Link>
        <p className="app-shell__context">{t(contextKey)}</p>
        <div className="app-shell__header-actions">
          <LocaleSwitcher />
          <Link
            aria-label={t('common.notifications')}
            className="app-shell__icon-link"
            title={t('common.notifications')}
            to="/notifications"
          >
            <Bell aria-hidden="true" />
          </Link>
          {!auth && !publishing ? (
            <Button
              aria-label={publishLabel}
              className="app-shell__publish"
              title={publishLabel}
              variant="publish"
              onClick={publish}
            >
              <Plus aria-hidden="true" />
              <span className="app-shell__publish-label">{publishLabel}</span>
            </Button>
          ) : null}
        </div>
      </header>
      <main className="app-shell__main" id="main-content" tabIndex={-1}>
        {spatial ? (
          <Outlet />
        ) : (
          <RouteSceneDirector>
            <Outlet />
          </RouteSceneDirector>
        )}
      </main>
      <nav
        aria-label={t('common.primaryNavigation')}
        className="app-shell__nav"
      >
        {destinations.map(({ href, key, Icon }) => (
          <NavLink
            key={href}
            to={href}
            title={t(key)}
            className={({ isActive }) =>
              isActive || (publishing && href === '/map')
                ? 'app-shell__nav-link is-active'
                : 'app-shell__nav-link'
            }
          >
            <Icon aria-hidden="true" />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
