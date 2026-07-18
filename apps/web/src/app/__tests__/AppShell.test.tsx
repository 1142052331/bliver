// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';

import { AppShell } from '../AppShell.js';
import { BliverI18nProvider } from '../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../i18n/i18n.js';
import { LOCALE_STORAGE_KEY } from '../../i18n/locale.js';

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

function renderShell(initialEntry = '/map') {
  const instance = createBliverI18n('en');
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

  return render(
    <BliverI18nProvider instance={instance}>
      <RouterProvider router={router} />
    </BliverI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('responsive app shell', () => {
  it('keeps exactly four primary destinations and separate commands', () => {
    renderShell();

    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
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
});
