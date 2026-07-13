import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnnouncementPanel from '../AnnouncementPanel';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../../api', () => ({ apiClient: { announcements: mocks } }));

describe('AnnouncementPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a retry action when announcements fail to load', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'));
    render(<AnnouncementPanel isOpen onClose={vi.fn()} isAsen={false} onToast={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('公告加载失败');
    expect(screen.getByRole('button', { name: '重试公告' })).toBeInTheDocument();
  });
});
