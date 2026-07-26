// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

vi.mock('../MapCanvas.js', () => ({ MapCanvas: (props: { readonly viewport?: { readonly west: number; readonly south: number; readonly east: number; readonly north: number } }) => <div data-testid="map-canvas" data-viewport={JSON.stringify(props.viewport)} /> }));

import { MapRoute } from '../MapRoute.js';

function renderMap(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}><MapRoute /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('map viewport state', () => {
  it('passes URL bounds into MapCanvas', () => {
    renderMap('/map?west=110&south=20&east=111&north=21');

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-viewport', JSON.stringify({ west: 110, south: 20, east: 111, north: 21 }));
  });

  it('falls back to safe bounds for malformed URL coordinates', () => {
    renderMap('/map?west=NaN&south=-999&east=181&north=');

    expect(screen.getByTestId('map-canvas')).toHaveAttribute(
      'data-viewport',
      JSON.stringify({ west: 120, south: 30, east: 122, north: 32 }),
    );
  });

  it.each([
    '/map?west=110&south=40&east=111&north=20',
    '/map?west=130&south=20&east=120&north=30',
    '/map?west=110&south=20&east=111',
  ])('falls back atomically for incomplete or inverted bounds: %s', (entry) => {
    renderMap(entry);

    expect(screen.getByTestId('map-canvas')).toHaveAttribute(
      'data-viewport',
      JSON.stringify({ west: 120, south: 30, east: 122, north: 32 }),
    );
  });
});
