// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';
import { MemoriesRoute } from '../MemoriesRoute.js';

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MemoriesRoute masthead', () => {
  it('opens the personal archive on recent entries without overview or map tabs', async () => {
    const footprintId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b72';
    const mediaUrl = 'https://res.cloudinary.com/demo/image/upload/v7/bliver/memory.webp';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/me')) return ok({ id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', username: 'river', displayName: 'River Song' });
      if (url.endsWith('/me')) return ok({
        summary: { footprintCount: 1, photoCount: 1, visitorCount: 0 },
        map: [{
          id: footprintId,
          message: 'Evening walk',
          publishedAt: '2026-07-23T08:00:00.000Z',
          visibility: 'public',
          displayPoint: { lat: 31, lng: 121 },
          primaryMedia: { url: mediaUrl, width: 1200, height: 800 },
        }],
      });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const i18n = createBliverI18n('en');

    const view = render(
      <QueryClientProvider client={client}>
        <BliverI18nProvider instance={i18n}>
          <MemoryRouter initialEntries={['/me']}>
            <Routes><Route path="/me" element={<MemoriesRoute />} /></Routes>
          </MemoryRouter>
        </BliverI18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Evening walk')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Recent archive' })).toHaveAttribute('href', '/me');
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument();
    expect(view.container.querySelector('.memory-ledger img')).toHaveAttribute('src', mediaUrl);
    expect(screen.getByRole('button', { name: 'Delete footprint' })).toBeVisible();
  });

  it('requests responsive photo candidates instead of a 16 pixel source', async () => {
    const footprintId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b72';
    const mediaUrl = 'https://res.cloudinary.com/demo/image/upload/v7/bliver/memory.webp';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/me')) return ok({ id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', username: 'river', displayName: 'River Song' });
      if (url.endsWith('/me')) return ok({ summary: { footprintCount: 1, photoCount: 1, visitorCount: 0 }, map: [] });
      if (url.endsWith('/me/photos')) return ok({
        items: [{ assetId: 'asset-1', footprintId, url: mediaUrl, createdAt: '2026-07-23T08:00:00.000Z' }],
      });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const i18n = createBliverI18n('en');

    render(
      <QueryClientProvider client={client}>
        <BliverI18nProvider instance={i18n}>
          <MemoryRouter initialEntries={['/me/photos']}>
            <Routes><Route path="/me/photos" element={<MemoriesRoute />} /></Routes>
          </MemoryRouter>
        </BliverI18nProvider>
      </QueryClientProvider>,
    );

    const image = await screen.findByRole('img', { name: 'Footprint memory' });
    expect(image.getAttribute('srcset')).toContain('w_320');
    expect(image.getAttribute('srcset')).toContain('w_1600');
    expect(image.getAttribute('srcset')).not.toContain('w_16/');
  });

  it('grounds the personal archive in the signed-in identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/me')) return ok({ id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', username: 'river', displayName: 'River Song', email: null, roles: ['user'] });
      if (url.endsWith('/me')) return ok({ summary: { footprintCount: 0, photoCount: 0, visitorCount: 0 }, map: [] });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const i18n = createBliverI18n('en');

    render(
      <QueryClientProvider client={client}>
        <BliverI18nProvider instance={i18n}>
          <MemoryRouter initialEntries={['/me']}>
            <Routes><Route path="/me" element={<MemoriesRoute />} /></Routes>
          </MemoryRouter>
        </BliverI18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('River Song')).toBeVisible();
    expect(screen.getByText('@river')).toBeVisible();
    expect(screen.getByText('RS')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Notification settings' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('link', { name: 'Visitors' })).toHaveAttribute('href', '/me/visitors');
    expect(screen.getByRole('heading', { name: 'Begin with one coordinate' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Leave the first footprint' })).toHaveAttribute('href', '/publish');
    expect(screen.queryByRole('heading', { name: 'Map memories' })).not.toBeInTheDocument();
  });

  it('shows public identity without exposing account settings', async () => {
    const userId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users?')) return ok({ items: [{ id: userId, username: 'mina', displayName: 'Mina Kato' }] });
      if (url.endsWith(`/profile/${userId}/memories`)) return ok({ summary: { footprintCount: 0, photoCount: 0, visitorCount: 0 }, map: [] });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const i18n = createBliverI18n('en');

    render(
      <QueryClientProvider client={client}>
        <BliverI18nProvider instance={i18n}>
          <MemoryRouter initialEntries={[`/profile/${userId}/memories`]}>
            <Routes><Route path="/profile/:userId/memories" element={<MemoriesRoute />} /></Routes>
          </MemoryRouter>
        </BliverI18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mina Kato')).toBeVisible();
    expect(screen.getByText('@mina')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Notification settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Visitors' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'It is quiet here' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Explore map' })).toHaveAttribute('href', '/map');
  });
});
