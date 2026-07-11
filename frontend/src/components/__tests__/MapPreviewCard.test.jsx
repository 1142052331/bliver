import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MapPreviewCard from '../MapPreviewCard';

const footprint = {
  _id: 'footprint-1',
  createdAt: new Date().toISOString(),
  placeName: '高知市',
  message: '天气晴朗\n在河边散步',
  mood: '🙂',
  sourceLabel: '同省',
  isUnread: true,
  photoUrl: 'https://example.com/photo.jpg',
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

  it('uses server source and unread metadata', () => {
    render(<MapPreviewCard footprint={footprint} onClose={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByText('同省')).toBeInTheDocument();
    expect(screen.getByText('未读更新')).toBeInTheDocument();
  });

  it('removes only failed media and keeps the detail action', () => {
    render(<MapPreviewCard footprint={footprint} onClose={vi.fn()} onOpenDetail={vi.fn()} />);
    const image = screen.getByRole('img');
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看详情' })).toBeInTheDocument();
  });

  it('preserves the full accessible place name when visual text truncates', () => {
    const placeName = '这是一个非常非常长但仍然需要完整读取的地点名称';
    render(
      <MapPreviewCard
        footprint={{ ...footprint, placeName }}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    );
    expect(screen.getByTitle(placeName)).toBeInTheDocument();
  });
});
