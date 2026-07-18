// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppRouter } from '../router.js';
import { BliverI18nProvider } from '../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../i18n/i18n.js';
import type { AppLocale } from '../../i18n/locale.js';

function renderRouter(path: string | undefined, locale: AppLocale = 'en') {
  return render(
    <BliverI18nProvider instance={createBliverI18n(locale)}>
      <AppRouter {...(path ? { initialEntries: [path] } : {})} />
    </BliverI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('V2 web route contract', () => {
  it.each([
    ['/map', 'Loading map'],
    ['/activity', 'Activity'],
    ['/people', 'People'],
    ['/messages', 'Messages'],
    ['/profile/test-user', 'Profile'],
    ['/footprints/test-footprint', 'Footprint'],
  ])('renders a route-owned empty state for %s', (path, heading) => {
    renderRouter(path);

    if (path === '/map') {
      expect(screen.getByRole('status')).toHaveTextContent(heading);
    } else {
      expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    }
    if (
      path === '/map' ||
      path === '/activity' ||
      path === '/people' ||
      path === '/messages' ||
      path.startsWith('/footprints/')
    ) {
      expect(screen.queryByText(/pending migration/i)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(/pending migration/i)).toBeVisible();
    }
  });

  it.each(['/me', '/notifications', '/admin'])(
    'guards %s behind an authenticated session',
    (path) => {
      renderRouter(path);
      expect(screen.getByRole('status')).toHaveTextContent('Loading session');
    },
  );

  it('exposes four navigation destinations and separate shell commands', () => {
    renderRouter('/map');

    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(within(navigation).getAllByRole('link')).toHaveLength(4);
    expect(within(navigation).getByRole('link', { name: 'Map' })).toHaveAttribute(
      'href',
      '/map',
    );
    expect(
      within(navigation).getByRole('link', { name: 'Activity' }),
    ).toHaveAttribute('href', '/activity');
    expect(
      within(navigation).getByRole('link', { name: 'Messages' }),
    ).toHaveAttribute('href', '/messages');
    expect(
      within(navigation).getByRole('link', { name: 'My space' }),
    ).toHaveAttribute('href', '/me');
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(
      screen.getByRole('button', { name: 'Leave footprint' }),
    ).toBeVisible();
  });

  it('renders global session and route states in Japanese', () => {
    renderRouter('/session-expired', 'ja');

    expect(
      screen.getByRole('heading', {
        name: 'セッションの有効期限が切れました',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'サインインへ進む' }),
    ).toHaveAttribute('href', '/login');
  });

  it('renders the not-found state in Japanese', () => {
    renderRouter('/missing-route', 'ja');

    expect(
      screen.getByRole('heading', { name: 'ページが見つかりません' }),
    ).toBeVisible();
  });

  it('renders the authenticated-route loading state in Japanese', () => {
    renderRouter('/me', 'ja');

    expect(screen.getByRole('status')).toHaveTextContent(
      'ログイン状態を確認中',
    );
  });

  it('uses the browser location when no test history is supplied', () => {
    window.history.replaceState({}, '', '/profile/test-user');

    renderRouter(undefined);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });

  it('closes a direct footprint deep link back to the map fallback', async () => {
    renderRouter('/footprints/test-footprint');

    fireEvent.click(screen.getByRole('button', { name: 'Close footprint' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading map');
  });
});
