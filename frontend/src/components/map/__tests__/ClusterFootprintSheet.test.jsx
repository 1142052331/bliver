import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClusterFootprintSheet from '../ClusterFootprintSheet';

const mocks = vi.hoisted(() => ({
  map: {
    fitBounds: vi.fn(),
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

describe('ClusterFootprintSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the cluster summary, sorts newest first, and expands on the map', async () => {
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
    expect(mocks.map.fitBounds).toHaveBeenCalledWith(selection.bounds, {
      padding: [48, 96],
      maxZoom: expect.any(Number),
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides map expansion for a single place', () => {
    render(
      <ClusterFootprintSheet
        selection={{ ...selection, placeCount: 1 }}
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
