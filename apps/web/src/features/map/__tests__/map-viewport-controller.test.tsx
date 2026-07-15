// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const map = { fitBounds: vi.fn() };
vi.mock('react-leaflet', () => ({ useMap: () => map }));

import { MapViewportController } from '../MapCanvas.js';

describe('MapViewportController', () => {
  it('imperatively fits the Leaflet map when URL bounds change', () => {
    const { rerender } = render(<MapViewportController viewport={{ west: 120, south: 30, east: 122, north: 32 }} />);
    expect(map.fitBounds).toHaveBeenCalledWith([[30, 120], [32, 122]], { animate: false });

    map.fitBounds.mockClear();
    rerender(<MapViewportController viewport={{ west: 110, south: 20, east: 111, north: 21 }} />);
    expect(map.fitBounds).toHaveBeenCalledWith([[20, 110], [21, 111]], { animate: false });
  });
});
