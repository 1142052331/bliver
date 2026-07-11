import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from '../MapView';

const mocks = vi.hoisted(() => ({ tileProps: vi.fn() }));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: (props) => {
    mocks.tileProps(props);
    return null;
  },
}));
vi.mock('../MapResizeHandler', () => ({ default: () => null }));
vi.mock('../ClusterMarkers', () => ({ default: () => null }));
vi.mock('../FlyToFootprint', () => ({ default: () => null }));
vi.mock('../RecenterOnLoad', () => ({ default: () => null }));
vi.mock('../PanToTarget', () => ({ default: () => null }));
vi.mock('../MapContextMenu', () => ({ default: () => null }));
vi.mock('../MapHomeControls', () => ({ default: () => null }));

const baseProps = {
  footprints: [{ _id: 'fp-1', location: { lat: 31.23, lng: 121.47 } }],
  shareTarget: null,
  activeFootprintId: null,
  timelineTargetFpId: null,
  user: null,
  isAdmin: false,
  setFlyArrivedFp: vi.fn(),
  setTimelineTargetFpId: vi.fn(),
  loading: false,
  fetching: false,
  error: null,
  onRetry: vi.fn(),
};

describe('MapView status separation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bounds tile failures, retries the tile generation, and recovers on load', async () => {
    const user = userEvent.setup();
    render(<MapView {...baseProps} />);
    const first = mocks.tileProps.mock.calls.at(-1)[0];

    act(() => {
      first.eventHandlers.tileerror();
      first.eventHandlers.tileerror();
    });
    expect(screen.queryByText('底图暂时无法加载')).not.toBeInTheDocument();
    act(() => first.eventHandlers.tileerror());
    expect(screen.getAllByText('底图暂时无法加载')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '重试底图' }));
    const retried = mocks.tileProps.mock.calls.at(-1)[0];
    expect(retried.url).not.toBe(first.url);
    act(() => retried.eventHandlers.load());
    expect(screen.queryByText('底图暂时无法加载')).not.toBeInTheDocument();
  });

  it('keeps tile and footprint failures independent', () => {
    render(<MapView {...baseProps} error={new Error('data')} />);
    const tile = mocks.tileProps.mock.calls.at(-1)[0];
    act(() => {
      tile.eventHandlers.tileerror();
      tile.eventHandlers.tileerror();
      tile.eventHandlers.tileerror();
    });

    expect(screen.getByText('底图暂时无法加载')).toBeInTheDocument();
    expect(screen.getByText('足迹暂时无法加载')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试足迹' })).toBeInTheDocument();
  });

  it('keeps cached markers visible while refreshing', () => {
    render(<MapView {...baseProps} fetching />);
    expect(screen.getByText('正在更新足迹')).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });
});
