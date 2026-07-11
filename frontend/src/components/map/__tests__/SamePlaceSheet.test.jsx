import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SamePlaceSheet from '../SamePlaceSheet';

const footprints = [
  {
    _id: 'older', createdAt: '2026-07-10T10:00:00.000Z', placeName: '中山公园',
    sourceLabel: '好友', isUnread: false, userId: { name: '小林' }, mood: '🌿',
  },
  {
    _id: 'newer', createdAt: '2026-07-11T10:00:00.000Z', placeName: '中山公园',
    sourceLabel: '同省', isUnread: true, userId: { name: '阿青' }, mood: '☀️',
  },
];

describe('SamePlaceSheet', () => {
  it('sorts current query items newest first and preserves source/unread text', () => {
    render(
      <SamePlaceSheet
        ids={['older', 'newer']}
        footprints={footprints}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const options = screen.getAllByRole('button', { name: /查看/ });
    expect(options[0]).toHaveAccessibleName(/阿青/);
    expect(options[1]).toHaveAccessibleName(/小林/);
    expect(screen.getByText('同省')).toBeInTheDocument();
    expect(screen.getByText('未读更新')).toBeInTheDocument();
  });

  it('selects an id before closing', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <SamePlaceSheet ids={['newer']} footprints={footprints} onClose={onClose} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /查看阿青的足迹/ }));
    expect(onSelect).toHaveBeenCalledWith('newer');
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it('closes on Escape and restores previous focus after unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(
      <SamePlaceSheet ids={['newer']} footprints={footprints} onClose={onClose} onSelect={vi.fn()} />,
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: '同地点足迹' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
