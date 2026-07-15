// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppRouter } from '../router.js';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('V2 web route contract', () => {
  it.each([
    ['/map', 'Map'],
    ['/activity', 'Activity'],
    ['/messages', 'Messages'],
    ['/me', 'My space'],
    ['/profile/test-user', 'Profile'],
    ['/footprints/test-footprint', 'Footprint'],
    ['/admin', 'Admin'],
  ])('renders a route-owned empty state for %s', (path, heading) => {
    render(<AppRouter initialEntries={[path]} />);

    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    if (path === '/map' || path.startsWith('/footprints/')) {
      expect(screen.queryByText(/pending migration/i)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(/pending migration/i)).toBeVisible();
    }
  });

  it('exposes four navigation destinations and a separate publish action', () => {
    render(<AppRouter initialEntries={['/map']} />);

    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute(
      'href',
      '/map',
    );
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
      'href',
      '/activity',
    );
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(screen.getByRole('link', { name: 'My space' })).toHaveAttribute(
      'href',
      '/me',
    );
    expect(
      screen.getByRole('button', { name: 'Publish footprint' }),
    ).toBeVisible();
  });

  it('uses the browser location when no test history is supplied', () => {
    window.history.replaceState({}, '', '/profile/test-user');

    render(<AppRouter />);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });
});
