import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlyToFootprint from '../FlyToFootprint';
import PanToTarget from '../PanToTarget';

const mocks = vi.hoisted(() => ({
  map: {
    flyTo: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    panTo: vi.fn(),
    stop: vi.fn(),
  },
  listeners: new Map(),
}));

vi.mock('react-leaflet', () => ({ useMap: () => mocks.map }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.map.on.mockImplementation((event, listener) => {
    mocks.listeners.set(event, listener);
  });
  mocks.map.off.mockImplementation((event, listener) => {
    if (mocks.listeners.get(event) === listener) mocks.listeners.delete(event);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('map navigation effects', () => {
  it('pans once and reports the latest footprint and callback on arrival', () => {
    vi.useFakeTimers();
    const firstOnArrive = vi.fn();
    const latestOnArrive = vi.fn();
    const initial = { _id: 'fp-1', message: 'initial', location: { lat: 31, lng: 121 } };
    const latest = { ...initial, message: 'latest' };
    const { rerender } = render(
      <PanToTarget targetId="fp-1" footprints={[initial]} onArrive={firstOnArrive} />,
    );

    rerender(<PanToTarget targetId="fp-1" footprints={[latest]} onArrive={latestOnArrive} />);
    act(() => vi.advanceTimersByTime(900));

    expect(mocks.map.panTo).toHaveBeenCalledOnce();
    expect(firstOnArrive).not.toHaveBeenCalled();
    expect(latestOnArrive).toHaveBeenCalledWith(latest);
  });

  it('flies once and reports the latest footprint and callback on move end', () => {
    const firstOnArrive = vi.fn();
    const latestOnArrive = vi.fn();
    const initial = { _id: 'fp-1', message: 'initial', location: { lat: 31, lng: 121 } };
    const latest = { ...initial, message: 'latest' };
    const { rerender } = render(
      <FlyToFootprint
        activeFootprintId="fp-1"
        footprints={[initial]}
        onArrive={firstOnArrive}
      />,
    );

    rerender(
      <FlyToFootprint
        activeFootprintId="fp-1"
        footprints={[latest]}
        onArrive={latestOnArrive}
      />,
    );
    act(() => mocks.listeners.get('moveend')());

    expect(mocks.map.flyTo).toHaveBeenCalledOnce();
    expect(firstOnArrive).not.toHaveBeenCalled();
    expect(latestOnArrive).toHaveBeenCalledWith(latest);
  });
});
