import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ClusterDetailPanel from '../ClusterDetailPanel';

vi.mock('../FootprintDetailModal', () => ({ default: () => null }));
vi.mock('../../readStatus', () => ({ getReadMap: () => ({}), isUnread: () => false }));
vi.mock('../../store/useUIStore', () => ({
  default: { getState: () => ({ openProfile: vi.fn() }) },
}));

const footprints = [
  {
    _id: 'fp-1',
    createdAt: '2026-07-10T01:00:00.000Z',
    placeName: '深圳市, 广东省, 中国',
    message: 'one',
    userId: { _id: 'user-1', name: 'One' },
    reactions: [],
    comments: [],
  },
  {
    _id: 'fp-2',
    createdAt: '2026-07-10T00:00:00.000Z',
    placeName: '深圳市, 广东省, 中国',
    message: 'two',
    userId: { _id: 'user-2', name: 'Two' },
    reactions: [],
    comments: [],
  },
];

describe('ClusterDetailPanel backdrop', () => {
  it('captures the click, closes the panel, and does not click through', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onBehindClick = vi.fn();
    const { container } = render(
      <div>
        <button type="button" onClick={onBehindClick}>Behind map</button>
        <ClusterDetailPanel footprints={footprints} userId="viewer" isAdmin={false} onClose={onClose} />
      </div>,
    );
    const backdrop = container.querySelector('div[class*="z-[1500]"]');

    expect(backdrop).toBeTruthy();
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBehindClick).not.toHaveBeenCalled();
    expect(backdrop).toHaveClass('pointer-events-auto');
    expect(backdrop).not.toHaveClass('pointer-events-none');
  });

  it('keeps clicks inside the drawer from closing the panel', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <ClusterDetailPanel footprints={footprints} userId="viewer" isAdmin={false} onClose={onClose} />,
    );

    fireEvent.click(getByText('one'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
