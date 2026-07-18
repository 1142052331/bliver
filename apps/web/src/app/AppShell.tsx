import { geoPoint } from '@bliver/contracts';
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
import './app-shell.css';

const destinations = [
  { href: '/map', key: 'nav.map', Icon: Map },
  { href: '/activity', key: 'nav.activity', Icon: Compass },
  { href: '/messages', key: 'nav.messages', Icon: MessageCircle },
  { href: '/me', key: 'nav.me', Icon: UserRound },
] as const;

export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const contextKey = location.pathname.startsWith('/activity')
    ? 'nav.activity'
    : location.pathname.startsWith('/messages')
      ? 'nav.messages'
      : location.pathname.startsWith('/me')
        ? 'nav.me'
        : location.pathname.startsWith('/notifications')
          ? 'common.notifications'
          : location.pathname.startsWith('/publish')
            ? 'actions.publish'
            : 'nav.map';
  const publishLabel = t('actions.publish');

  const publish = (): void => {
    const params = new URLSearchParams(location.search);
    const lat = params.get('lat');
    const lng = params.get('lng');
    const point =
      lat !== null && lng !== null
        ? geoPoint.safeParse({ lat: Number(lat), lng: Number(lng) }).data
        : undefined;

    navigate(
      '/publish',
      point ? { state: { initialPoint: point } } : undefined,
    );
  };

  return (
    <div className="app-shell">
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
        </div>
      </header>
      <main className="app-shell__main" id="main-content">
        <Outlet />
      </main>
      <nav
        aria-label={t('common.primaryNavigation')}
        className="app-shell__nav"
      >
        {destinations.map(({ href, key, Icon }) => (
          <NavLink
            key={href}
            to={href}
            className={({ isActive }) =>
              isActive
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
