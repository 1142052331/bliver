// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remote = vi.hoisted(() => ({
  current: {
    data: undefined as { readonly items: readonly Record<string, unknown>[] } | undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({ useMapFootprintsQuery: () => remote.current }));
vi.mock('../realtime.js', () => ({ connectMapRealtime: () => () => undefined }));
vi.mock('../MapCanvas.js', () => ({
  MapCanvas: ({ selectedId }: { readonly selectedId?: string }) => (
    <div data-selected-id={selectedId ?? ''} data-testid="map-canvas" />
  ),
}));

import { MapRoute } from '../MapRoute.js';
import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';

const mapItems = [
  {
    id: 'footprint-a',
    author: { name: 'Aster' },
    displayPoint: { lat: 31.23, lng: 121.47 },
    locationPrecision: 'approximate',
    publishedAt: '2026-07-17T00:00:00.000Z',
    visibility: 'public',
  },
  {
    id: 'footprint-b',
    author: { name: 'Mori' },
    displayPoint: { lat: 35.68, lng: 139.76 },
    locationPrecision: 'precise',
    publishedAt: '2026-07-18T00:00:00.000Z',
    visibility: 'friends',
  },
] as const;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>History back</button>
      <button type="button" onClick={() => navigate(1)}>History forward</button>
    </>
  );
}

function renderRemoteRoute(initialEntry = '/') {
  const instance = createBliverI18n('en');
  const route = () => (
    <BliverI18nProvider instance={instance}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MapRoute loadFromApi />
        <LocationProbe />
        <HistoryControls />
      </MemoryRouter>
    </BliverI18nProvider>
  );
  const result = render(route());
  return {
    ...result,
    rerenderRemote() {
      result.rerender(route());
    },
  };
}

describe('remote map state', () => {
  beforeEach(() => {
    remote.current = {
      data: undefined,
      isError: false,
      isLoading: true,
      refetch: vi.fn(),
    };
  });

  afterEach(() => cleanup());

  it('renders remote loading and retries the failed query', () => {
    const { rerenderRemote } = renderRemoteRoute();
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');

    const refetch = vi.fn();
    remote.current = { data: undefined, isLoading: false, isError: true, refetch };
    rerenderRemote();
    expect(screen.getByRole('heading', { name: 'Map unavailable' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('preserves a footprint deep link while loading and selects its item when data arrives', () => {
    const { rerenderRemote } = renderRemoteRoute('/?footprint=footprint-b');

    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    expect(screen.getByTestId('location-search')).toHaveTextContent('footprint=footprint-b');

    remote.current = {
      data: { items: mapItems },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    rerenderRemote();

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected-id', 'footprint-b');
    expect(screen.getByRole('link', { name: 'Open footprint' })).toHaveAttribute(
      'href',
      '/footprints/footprint-b',
    );
  });

  it('does not fall back to the first item for an invalid footprint deep link', () => {
    remote.current = {
      data: { items: mapItems },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };

    renderRemoteRoute('/?footprint=missing');

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected-id', '');
    expect(screen.queryByRole('link', { name: 'Open footprint' })).not.toBeInTheDocument();
  });

  it('keeps search expansion synchronized with URL history and restores focus on close', async () => {
    remote.current = {
      data: { items: mapItems },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    renderRemoteRoute('/map');

    const searchTrigger = screen.getByRole('button', { name: 'Search places' });
    fireEvent.click(searchTrigger);
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=open');
    expect(screen.getByRole('textbox', { name: 'Place search' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Place search' })).not.toBeInTheDocument();
    });
    expect(searchTrigger).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(await screen.findByRole('textbox', { name: 'Place search' })).toBeVisible();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Place search' }), {
      key: 'Escape',
    });
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('search=open');
    });
    expect(searchTrigger).toHaveFocus();

    fireEvent.click(searchTrigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('search=open');
    expect(searchTrigger).toHaveFocus();
  });
});
