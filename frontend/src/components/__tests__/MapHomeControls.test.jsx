import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapHomeControls from '../MapHomeControls';
import { DEFAULT_MAP_QUERY } from '../../domain/mapQuery';

const map = vi.hoisted(() => ({ flyTo: vi.fn() }));

vi.mock('react-leaflet', () => ({ useMap: () => map }));

function renderControls(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MapHomeControls footprints={[]} {...props} />
    </QueryClientProvider>,
  );
}

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
    renderControls();

    await userEvent.click(screen.getByRole('button', { name: '定位到我的位置' }));

    expect(screen.getByRole('status')).toHaveTextContent('此浏览器不支持定位');
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('reports a rejected location request', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn((_success, reject) => reject(new Error('denied'))) },
    });
    renderControls();

    await userEvent.click(screen.getByRole('button', { name: '定位到我的位置' }));

    expect(screen.getByRole('status')).toHaveTextContent('无法获取当前位置，请检查定位权限');
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('resets to the first valid footprint', async () => {
    renderControls({ footprints: [
      { _id: 'missing-location' },
      { _id: 'latest', location: { lat: 31.23, lng: 121.47 } },
    ] });

    await userEvent.click(screen.getByRole('button', { name: '回到足迹视野' }));

    expect(map.flyTo).toHaveBeenCalledWith([31.23, 121.47], 11, { duration: 0.6 });
  });

  it('composes scope and filters through one map query callback', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderControls({
      query: DEFAULT_MAP_QUERY,
      isAuthenticated: true,
      locationContext: {
        scope: 'smart', reason: 'resolved-location',
        countryCode: 'CN', countryName: '中国', regionCode: 'CN-SH', regionName: '上海市',
      },
      onQueryChange,
      onRequestLocation: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: '智能' }));
    expect(screen.getByRole('dialog', { name: '选择地图范围' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /全球/ }));
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...DEFAULT_MAP_QUERY, scope: 'global' });

    await user.click(screen.getByRole('button', { name: '筛选' }));
    expect(screen.queryByRole('dialog', { name: '选择地图范围' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '好友' }));
    await user.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...DEFAULT_MAP_QUERY, relationship: 'friends' });
  });
});
