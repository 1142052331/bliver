import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapHomeControls from '../MapHomeControls';

const map = vi.hoisted(() => ({ flyTo: vi.fn() }));

vi.mock('react-leaflet', () => ({ useMap: () => map }));

describe('MapHomeControls', () => {
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    map.flyTo.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('reports when browser location is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    render(<MapHomeControls footprints={[]} />);

    await userEvent.click(screen.getByRole('button', { name: '定位到我的位置' }));

    expect(screen.getByRole('status')).toHaveTextContent('此浏览器不支持定位');
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('reports a rejected location request', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn((_success, reject) => reject(new Error('denied'))) },
    });
    render(<MapHomeControls footprints={[]} />);

    await userEvent.click(screen.getByRole('button', { name: '定位到我的位置' }));

    expect(screen.getByRole('status')).toHaveTextContent('无法获取当前位置，请检查定位权限');
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('resets to the first valid footprint', async () => {
    render(<MapHomeControls footprints={[
      { _id: 'missing-location' },
      { _id: 'latest', location: { lat: 31.23, lng: 121.47 } },
    ]} />);

    await userEvent.click(screen.getByRole('button', { name: '回到足迹视野' }));

    expect(map.flyTo).toHaveBeenCalledWith([31.23, 121.47], 11, { duration: 0.6 });
  });
});
