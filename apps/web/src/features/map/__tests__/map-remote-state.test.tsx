// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const remote = vi.hoisted(() => ({
  current: { data: undefined, isLoading: true, isError: false, refetch: vi.fn() },
}));

vi.mock('../api.js', () => ({ useMapFootprintsQuery: () => remote.current }));
vi.mock('../realtime.js', () => ({ connectMapRealtime: () => () => undefined }));
vi.mock('../MapCanvas.js', () => ({ MapCanvas: () => <div data-testid="map-canvas" /> }));

import { MapRoute } from '../MapRoute.js';

describe('remote map state', () => {
  it('renders remote loading and retries the failed query', () => {
    const { rerender } = render(<MemoryRouter><MapRoute loadFromApi /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');

    const refetch = vi.fn();
    remote.current = { data: undefined, isLoading: false, isError: true, refetch };
    rerender(<MemoryRouter><MapRoute loadFromApi /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Map unavailable' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
