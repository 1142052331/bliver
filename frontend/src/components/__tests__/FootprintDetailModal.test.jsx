import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FootprintDetailModal from '../FootprintDetailModal';

const mocks = vi.hoisted(() => ({
  markRead: vi.fn(),
  setViewedFootprintId: vi.fn(),
}));

vi.mock('../../api', () => ({
  apiClient: { footprints: { markRead: mocks.markRead } },
}));

vi.mock('../../store/useUIStore', () => ({
  default: {
    getState: () => ({
      openProfile: vi.fn(),
      setViewedFootprintId: mocks.setViewedFootprintId,
    }),
  },
}));

vi.mock('../../contexts/FootprintActionsContext', () => ({
  useFootprintActionsContext: () => ({
    handleReact: vi.fn(),
    handleDelete: vi.fn(),
    handleShare: vi.fn(),
    handleComment: vi.fn(),
    handleDeleteComment: vi.fn(),
  }),
}));

const footprint = {
  _id: 'fp-1',
  isUnread: true,
  userId: { _id: 'author-1', name: 'Alice' },
  createdAt: '2026-07-11T08:00:00.000Z',
  placeName: 'Shanghai',
  message: 'Hello from the map',
  reactions: [],
  comments: [],
};

function renderDetail({ userId = 'viewer-1', queryClient = new QueryClient(), strict = false } = {}) {
  const detail = (
    <FootprintDetailModal
      fp={footprint}
      allFootprints={[footprint]}
      userId={userId}
      isAdmin={false}
      onClose={vi.fn()}
    />
  );
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {strict ? <StrictMode>{detail}</StrictMode> : detail}
      </QueryClientProvider>,
    ),
  };
}

describe('FootprintDetailModal authoritative read state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markRead.mockResolvedValue({ data: { ok: true } });
  });

  it('marks an unread footprint once and updates every list cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['footprints', 'map', { scope: 'global' }], { footprints: [footprint] });
    queryClient.setQueryData(['footprints', 'activity', 'week'], [footprint]);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderDetail({ queryClient, strict: true });

    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledTimes(1));
    expect(mocks.markRead).toHaveBeenCalledWith('fp-1');
    await waitFor(() => {
      expect(queryClient.getQueryData(['footprints', 'map', { scope: 'global' }]).footprints[0].isUnread).toBe(false);
      expect(queryClient.getQueryData(['footprints', 'activity', 'week'])[0].isUnread).toBe(false);
    });
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: ['footprints', 'map'] }],
      [{ queryKey: ['footprints', 'activity'] }],
    ]);
  });

  it('restores unread state on failure and offers a retry', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['footprints', 'map', { scope: 'global' }], { footprints: [footprint] });
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    mocks.markRead.mockRejectedValueOnce(new Error('offline'));
    renderDetail({ queryClient, strict: true });

    const retry = await screen.findByRole('button', { name: '重试标记已读' });
    expect(queryClient.getQueryData(['footprints', 'map', { scope: 'global' }]).footprints[0].isUnread).toBe(true);

    await user.click(retry);
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: '重试标记已读' })).not.toBeInTheDocument());
  });

  it('does not send read state for a guest', async () => {
    renderDetail({ userId: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.markRead).not.toHaveBeenCalled();
  });
});
