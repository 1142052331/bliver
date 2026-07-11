import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MapPreviewCard from '../MapPreviewCard';

const footprint = {
  _id: 'footprint-1',
  createdAt: new Date().toISOString(),
  placeName: '高知市',
  message: '天气晴朗\n在河边散步',
  mood: '🙂',
  userId: { _id: 'author-1', name: '阿森' },
};

describe('MapPreviewCard', () => {
  it('shows a selected footprint and opens its existing detail flow', async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    render(<MapPreviewCard footprint={footprint} userId="viewer-1" onClose={vi.fn()} onOpenDetail={onOpenDetail} />);

    expect(screen.getByRole('region', { name: '足迹预览' })).toHaveTextContent('在河边散步');
    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('supports closing the preview without opening a detail', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MapPreviewCard footprint={footprint} userId="viewer-1" onClose={onClose} onOpenDetail={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '关闭足迹预览' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
