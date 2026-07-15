// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../MapCanvas.js', () => ({ MapCanvas: (props: { readonly viewport?: { readonly west: number; readonly south: number; readonly east: number; readonly north: number } }) => <div data-testid="map-canvas" data-viewport={JSON.stringify(props.viewport)} /> }));

import { MapRoute } from '../MapRoute.js';

describe('map viewport state', () => {
  it('passes URL bounds into MapCanvas', () => {
    render(<MemoryRouter initialEntries={['/map?west=110&south=20&east=111&north=21']}><MapRoute /></MemoryRouter>);

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-viewport', JSON.stringify({ west: 110, south: 20, east: 111, north: 21 }));
  });
});
