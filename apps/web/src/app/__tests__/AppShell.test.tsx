// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router';

import { AppShell } from '../AppShell.js';
import { BliverI18nProvider } from '../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../i18n/i18n.js';
import { LOCALE_STORAGE_KEY } from '../../i18n/locale.js';
import { sessionQueryKey } from '../../features/auth/queries.js';
import { SessionProvider } from '../providers/SessionProvider.js';

function RouteBody() {
  return <Outlet />;
}

function PublishProbe() {
  const location = useLocation();
  return (
    <output data-testid="publish-location">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </output>
  );
}

function renderShell(
  initialEntry = '/map',
  sessionState: 'authenticated' | 'guest' = 'authenticated',
) {
  const instance = createBliverI18n('en');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (sessionState === 'authenticated') {
    queryClient.setQueryData(sessionQueryKey, {
      id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
      deviceName: 'Test browser',
      createdAt: '2026-07-23T00:00:00.000Z',
      lastSeenAt: '2026-07-23T00:00:00.000Z',
      current: true,
    });
  }
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { element: <RouteBody />, path: '*' },
          { element: <PublishProbe />, path: 'publish' },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  const shell = (
    <BliverI18nProvider instance={instance}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </BliverI18nProvider>
  );
  const view = render(shell);
  return { ...view, queryClient, router };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('responsive app shell', () => {
  it('keeps exactly four primary destinations and separate commands', () => {
    renderShell();

    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
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
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue(
      'en',
    );
  });

  it('persists a language choice and updates the shell immediately', async () => {
    renderShell();

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'ja' },
    });

    expect(
      await screen.findByRole('button', { name: '足跡を残す' }),
    ).toBeVisible();
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
    expect(screen.getByRole('combobox', { name: '言語' })).toHaveValue('ja');
  });

  it('passes valid map coordinates into the publish route state', async () => {
    renderShell('/map?lat=31.2&lng=121.4');

    fireEvent.click(screen.getByRole('button', { name: 'Leave footprint' }));

    expect(await screen.findByTestId('publish-location')).toHaveTextContent(
      '"initialPoint":{"lat":31.2,"lng":121.4}',
    );
  });

  it.each([
    '/map?lat=Infinity&lng=121.4',
    '/map?lat=91&lng=121.4',
    '/map?lat=31.2&lng=181',
  ])('does not pass invalid map coordinates from %s', async (path) => {
    renderShell(path);

    fireEvent.click(screen.getByRole('button', { name: 'Leave footprint' }));

    expect(await screen.findByTestId('publish-location')).not.toHaveTextContent(
      'initialPoint',
    );
  });

  it.each([
    ['Messages', '/messages'],
    ['My space', '/me'],
  ])('prompts a guest before opening %s', async (label, destination) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'AUTH_REQUIRED' }),
    }));
    const { queryClient, router } = renderShell('/map', 'guest');
    await waitFor(() => expect(queryClient.getQueryState(sessionQueryKey)?.status).toBe('error'));

    fireEvent.click(screen.getByRole('link', { name: label }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth-required'));
    expect(router.state.location.search).toBe(
      `?returnTo=${encodeURIComponent(destination)}`,
    );
  });

  it('keeps the selected map point when prompting a guest to publish', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'AUTH_REQUIRED' }),
    }));
    const { queryClient, router } = renderShell('/map?lat=31.2&lng=121.4', 'guest');
    await waitFor(() => expect(queryClient.getQueryState(sessionQueryKey)?.status).toBe('error'));

    fireEvent.click(screen.getByRole('button', { name: 'Leave footprint' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth-required'));
    expect(router.state.location.search).toBe(
      `?returnTo=${encodeURIComponent('/publish?lat=31.2&lng=121.4')}`,
    );
  });
});
