import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClusterFootprintSheet from '../ClusterFootprintSheet';

const mocks = vi.hoisted(() => ({
  map: {
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    setZoom: vi.fn(),
    getMaxZoom: vi.fn(() => 18),
    getZoom: vi.fn(() => 8),
  },
}));

vi.mock('react-leaflet', () => ({ useMap: () => mocks.map }));

const selection = {
  footprintIds: ['older', 'newer', 'middle'],
  bounds: [[31.23, 121.47], [31.24, 121.48]],
  placeCount: 2,
  footprintCount: 3,
  expandOnMap: vi.fn(),
};

const footprints = [
  {
    _id: 'older', createdAt: '2026-07-10T10:00:00.000Z', placeName: '中山公园',
    sourceLabel: '朋友', isUnread: false, userId: { name: '小林' }, mood: '🌤️',
  },
  {
    _id: 'newer', createdAt: '2026-07-11T10:00:00.000Z', placeName: '中山公园',
    sourceLabel: '同省', isUnread: true, userId: { name: '阿青' }, mood: '⭐',
  },
  {
    _id: 'middle', createdAt: '2026-07-10T12:00:00.000Z', placeName: '外滩',
    sourceLabel: '全球', isUnread: false, userId: { name: '阿森' }, mood: '📍',
  },
];

const locatableFootprints = [
  { ...footprints[0], location: { lat: 31.22, lng: 121.46 } },
  { ...footprints[1], location: { lat: 31.23, lng: 121.47 } },
  { ...footprints[2], location: { lat: Number.NaN, lng: 121.49 } },
];

describe('ClusterFootprintSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the cluster summary, sorts newest first, and expands on the map before closing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ClusterFootprintSheet selection={selection} footprints={footprints} onClose={onClose} onSelect={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '集合足迹' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '2 个地点' })).toBeVisible();
    expect(screen.getByText('3 条足迹')).toBeVisible();
    const options = screen.getAllByRole('button', { name: /查看/ });
    expect(options[0]).toHaveAccessibleName(/阿青/);
    expect(await screen.findByRole('button', { name: '在地图中展开' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '在地图中展开' }));
    expect(selection.expandOnMap).toHaveBeenCalledOnce();
    expect(selection.expandOnMap.mock.invocationCallOrder[0])
      .toBeLessThan(onClose.mock.invocationCallOrder[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the selected cluster callback for broad geographic bounds', async () => {
    const user = userEvent.setup();
    const expandOnMap = vi.fn();
    const broadSelection = {
      ...selection,
      bounds: [[-50, -120], [60, 120]],
      expandOnMap,
    };
    render(<ClusterFootprintSheet selection={broadSelection} footprints={footprints} onClose={vi.fn()} onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '在地图中展开' }));

    expect(expandOnMap).toHaveBeenCalledOnce();
    expect(mocks.map.fitBounds).not.toHaveBeenCalled();
    expect(mocks.map.setZoom).not.toHaveBeenCalled();
  });

  it('hides map expansion for a single place or a selection without an expandable callback', () => {
    render(
      <ClusterFootprintSheet
        selection={{ ...selection, placeCount: 1 }}
        footprints={footprints}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '在地图中展开' })).not.toBeInTheDocument();

    render(
      <ClusterFootprintSheet
        selection={{ ...selection, expandOnMap: undefined }}
        footprints={footprints}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '在地图中展开' })).not.toBeInTheDocument();
  });

  it('selects a footprint before closing', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ClusterFootprintSheet selection={selection} footprints={footprints} onClose={onClose} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /查看阿青/ }));
    expect(onSelect).toHaveBeenCalledWith('newer');
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it('locates a valid footprint before selecting and closing', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ClusterFootprintSheet selection={selection} footprints={locatableFootprints} onClose={onClose} onSelect={onSelect} />);

    const locationCommand = screen.getByRole('button', { name: '定位到阿青在中山公园的位置' });
    expect(locationCommand).toHaveAttribute('title', '定位到此位置');
    await user.click(locationCommand);

    expect(mocks.map.flyTo).toHaveBeenCalledWith([31.23, 121.47], 17, { duration: 0.7 });
    expect(mocks.map.flyTo.mock.invocationCallOrder[0])
      .toBeLessThan(onSelect.mock.invocationCallOrder[0]);
    expect(onSelect).toHaveBeenCalledWith('newer');
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it('omits the location command for footprints without finite coordinates', () => {
    render(<ClusterFootprintSheet selection={selection} footprints={locatableFootprints} onClose={vi.fn()} onSelect={vi.fn()} />);

    const invalidFootprint = screen.getByRole('button', { name: /查看阿森/ })
      .closest('.bliver-cluster-footprint-list__item');

    expect(invalidFootprint).not.toBeNull();
    expect(within(invalidFootprint).queryByRole('button', { name: /定位到/ })).not.toBeInTheDocument();
  });

  it('closes on Escape and restores focus after unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<ClusterFootprintSheet selection={selection} footprints={footprints} onClose={onClose} onSelect={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('dialog', { name: '集合足迹' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
