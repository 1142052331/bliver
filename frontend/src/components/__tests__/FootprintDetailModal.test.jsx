import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FootprintDetailModal from '../FootprintDetailModal';

const mocks = vi.hoisted(() => ({
  markRead: vi.fn(),
  setViewedFootprintId: vi.fn(),
  storeState: { footprintEvent: null, footprintEventId: 0 },
  footprintSubscribers: new Set(),
}));

vi.mock('../../api', () => ({
  apiClient: { footprints: { markRead: mocks.markRead } },
}));

vi.mock('../../store/useUIStore', () => ({
  default: {
    getState: () => ({
      ...mocks.storeState,
      openProfile: vi.fn(),
      setViewedFootprintId: mocks.setViewedFootprintId,
    }),
    subscribe: (_selector, listener) => {
      mocks.footprintSubscribers.add(listener);
      return () => mocks.footprintSubscribers.delete(listener);
    },
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

function renderDetail({
  userId = 'viewer-1', queryClient = new QueryClient(), strict = false,
  fp = footprint, allFootprints = [fp], onClose = vi.fn(), isAdmin = false,
} = {}) {
  const detail = (
    <FootprintDetailModal
      fp={fp}
      allFootprints={allFootprints}
      userId={userId}
      isAdmin={isAdmin}
      onClose={onClose}
    />
  );
  return {
    queryClient,
    onClose,
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
    mocks.storeState.footprintEvent = null;
    mocks.storeState.footprintEventId = 0;
    mocks.footprintSubscribers.clear();
  });

  function emitFootprintEvent(event) {
    mocks.storeState.footprintEvent = event;
    mocks.storeState.footprintEventId += 1;
    for (const listener of mocks.footprintSubscribers) listener();
  }

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

  it('renders nothing when the selected footprint disappears before mount', () => {
    const { container } = renderDetail({ fp: null, allFootprints: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('updates the open detail from a realtime update that remains visible', async () => {
    renderDetail({ userId: null, fp: { ...footprint, isUnread: false } });

    emitFootprintEvent({
      type: 'updated',
      footprint: { ...footprint, isUnread: false, message: 'Fresh from the socket' },
    });

    expect(await screen.findByText('Fresh from the socket')).toBeInTheDocument();
    expect(screen.queryByText('Hello from the map')).not.toBeInTheDocument();
  });

  it('closes an open detail when its footprint is deleted', async () => {
    const onClose = vi.fn();
    renderDetail({ userId: null, fp: { ...footprint, isUnread: false }, onClose });

    emitFootprintEvent({ type: 'deleted', footprintId: 'fp-1' });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['private', { visibility: 'private' }],
    ['expired public', { visibility: 'public', discoveryExpiresAt: '2026-07-11T00:00:00.000Z' }],
  ])('closes a guest detail after a realtime %s visibility update', async (_label, update) => {
    vi.setSystemTime('2026-07-12T00:00:00.000Z');
    const onClose = vi.fn();
    renderDetail({ userId: null, fp: { ...footprint, isUnread: false }, onClose });

    emitFootprintEvent({
      type: 'updated', footprint: { ...footprint, isUnread: false, ...update },
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    vi.useRealTimers();
  });

  it('keeps an owner detail open and refreshes it when the footprint becomes private', async () => {
    const onClose = vi.fn();
    renderDetail({
      userId: 'author-1', fp: { ...footprint, isUnread: false }, onClose,
    });

    emitFootprintEvent({
      type: 'updated',
      footprint: { ...footprint, isUnread: false, visibility: 'private', message: 'Only for me' },
    });

    expect(await screen.findByText('Only for me')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
