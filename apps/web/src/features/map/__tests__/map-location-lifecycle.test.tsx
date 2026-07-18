// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface CapturedMapControls {
  readonly onLocate: () => void | Promise<void>;
}

const controls = vi.hoisted(() => ({
  current: undefined as CapturedMapControls | undefined,
}));

vi.mock('../MapControls.js', () => ({
  MapControls: (props: CapturedMapControls) => {
    controls.current = props;
    return <div data-testid="map-controls" />;
  },
}));
vi.mock('../MapCanvas.js', () => ({
  MapCanvas: () => <div data-testid="map-canvas" />,
}));

import { MapRoute } from '../MapRoute.js';

interface GeolocationCall {
  readonly success: PositionCallback;
  readonly error: PositionErrorCallback | null | undefined;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function UnmountHarness() {
  const [showMap, setShowMap] = useState(true);
  return (
    <>
      {showMap ? <MapRoute /> : null}
      <button type="button" onClick={() => setShowMap(false)}>Leave map</button>
      <LocationProbe />
    </>
  );
}

function stubGeolocation(): GeolocationCall[] {
  const calls: GeolocationCall[] = [];
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: vi.fn((
        success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => calls.push({ success, error })),
    },
    onLine: true,
  });
  return calls;
}

function position(latitude: number, longitude: number): GeolocationPosition {
  return { coords: { latitude, longitude } } as GeolocationPosition;
}

afterEach(() => {
  cleanup();
  controls.current = undefined;
  vi.unstubAllGlobals();
});

describe('map geolocation lifecycle', () => {
  it('invalidates an older geolocation callback when a newer request starts', async () => {
    const calls = stubGeolocation();
    render(
      <MemoryRouter>
        <MapRoute />
        <LocationProbe />
      </MemoryRouter>,
    );

    const first = Promise.resolve(controls.current?.onLocate());
    const second = Promise.resolve(controls.current?.onLocate());
    expect(calls).toHaveLength(2);
    await first;

    await act(async () => calls[0]?.success(position(10, 20)));
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('lat=10');

    await act(async () => calls[1]?.success(position(35.68, 139.76)));
    await second;
    expect(screen.getByTestId('location-search')).toHaveTextContent('lat=35.68');
    expect(screen.getByTestId('location-search')).toHaveTextContent('lng=139.76');
  });

  it('invalidates geolocation callbacks when the map route unmounts', async () => {
    const calls = stubGeolocation();
    render(<MemoryRouter><UnmountHarness /></MemoryRouter>);

    const pending = Promise.resolve(controls.current?.onLocate());
    expect(calls).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Leave map' }));
    await pending;

    await act(async () => calls[0]?.success(position(35.68, 139.76)));
    expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/);
  });
});
