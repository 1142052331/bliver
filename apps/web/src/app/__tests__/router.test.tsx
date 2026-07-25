// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InitialEntry } from 'react-router-dom';

import { AppRouter } from '../router.js';
import { BliverI18nProvider } from '../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../i18n/i18n.js';
import type { AppLocale } from '../../i18n/locale.js';

vi.mock('../../features/map/MapCanvas.js', () => ({
  MapCanvas: () => <div data-testid="map-canvas" />,
}));

function renderRouter(path: InitialEntry | undefined, locale: AppLocale = 'en') {
  return render(
    <BliverI18nProvider instance={createBliverI18n(locale)}>
      <AppRouter {...(path ? { initialEntries: [path] } : {})} />
    </BliverI18nProvider>,
  );
}

function holdSessionRequest() {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('V2 web route contract', () => {
  it.each([
    ['/map', 'Loading map'],
    ['/activity', 'Activity'],
    ['/people', 'People'],
    ['/register', 'Create account'],
    ['/profile/test-user', 'Profile'],
    ['/footprints/test-footprint', 'Footprint'],
  ])('renders a route-owned empty state for %s', async (path, heading) => {
    renderRouter(path);

    if (path === '/map') {
      expect(
        await screen.findByText(heading, undefined, { timeout: 5_000 }),
      ).toBeVisible();
    } else {
      expect(
        await screen.findByRole(
          'heading',
          { name: heading },
          { timeout: 5_000 },
        ),
      ).toBeVisible();
    }
    expect(screen.queryByText(/pending migration/i)).not.toBeInTheDocument();
    if (path === '/profile/test-user') {
      expect(
        screen.getByText('Organizing your footprints and photos'),
      ).toBeVisible();
    }
  }, 10_000);

  it.each(['/me', '/notifications', '/admin'])(
    'guards %s behind an authenticated session',
    async (path) => {
      holdSessionRequest();
      renderRouter(path);
      expect(await screen.findByText('Loading session')).toBeInTheDocument();
      expect(document.querySelector('.app-status-scene')).not.toBeInTheDocument();
    },
  );

  it('releases an authenticated route after the session request resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/session')) {
        return new Response(JSON.stringify({
          id: '019f0000-0000-7000-8000-000000000705',
          deviceName: 'Router test',
          createdAt: '2026-07-15T08:00:00.000Z',
          lastSeenAt: '2026-07-15T08:00:00.000Z',
          current: true,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/api/v1/map/footprints')) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }));

    renderRouter('/publish?lat=31.231&lng=121.471');

    expect(await screen.findByRole('heading', { name: 'Publish a footprint' })).toBeVisible();
    expect(
      document.querySelector('[data-auth-session-state="loading"]'),
    ).not.toBeInTheDocument();
  });

  it('prompts a guest before the message surface mounts and preserves the destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'AUTH_REQUIRED' }),
    }));

    renderRouter('/messages');

    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fmessages',
    );
    expect(screen.queryByRole('heading', { name: 'Messages' })).not.toBeInTheDocument();
  });

  it('does not expose the notification center under an account-settings alias', async () => {
    renderRouter('/settings');

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('exposes four navigation destinations and separate shell commands', async () => {
    renderRouter('/map');

    const navigation = await screen.findByRole('navigation', {
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

  it('renders global session and route states in Japanese', async () => {
    renderRouter('/session-expired', 'ja');

    expect(
      await screen.findByRole('heading', {
        name: 'セッションの有効期限が切れました',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'サインインへ進む' }),
    ).toHaveAttribute('href', '/login?returnTo=%2Fmap');
    expect(
      screen.getByText(/移動先と未投稿の足跡下書き/),
    ).toBeVisible();
    expect(screen.queryByText('SESSION / 401')).not.toBeInTheDocument();
  });

  it('carries the interrupted destination in both the login URL and route state', async () => {
    const destination = '/publish?lat=31.2&lng=121.5';
    renderRouter({
      pathname: '/session-expired',
      state: { from: destination },
    });

    const link = await screen.findByRole('link', { name: 'Continue to sign in' });
    expect(link).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent(destination)}`,
    );
    expect(screen.getByText(/destination and any unsent footprint draft/)).toBeVisible();
    expect(screen.queryByText(/SESSION \/ 401|SYNC \/ 001|AUTH \/ 001/)).not.toBeInTheDocument();
  });

  it('renders the not-found state in Japanese', () => {
    renderRouter('/missing-route', 'ja');

    expect(
      screen.getByRole('heading', { name: 'ページが見つかりません' }),
    ).toBeVisible();
  });

  it('renders the authenticated-route loading state in Japanese', async () => {
    holdSessionRequest();
    renderRouter('/me', 'ja');

    await waitFor(() => {
      expect(
        document.querySelector('[data-auth-session-state="loading"]'),
      ).toHaveTextContent('ログイン状態を確認中');
    });
  });

  it('uses the browser location when no test history is supplied', async () => {
    window.history.replaceState({}, '', '/profile/test-user');

    renderRouter(undefined);

    expect(
      await screen.findByRole('heading', { name: 'Profile' }),
    ).toBeVisible();
  });

  it('closes a direct footprint deep link back to the map fallback', async () => {
    renderRouter('/footprints/test-footprint');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Close footprint' }),
    );

    expect(await screen.findByText('Loading map')).toBeVisible();
  });
});
