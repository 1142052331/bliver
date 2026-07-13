import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useFootprintActions from '../useFootprintActions';

const mocks = vi.hoisted(() => ({
  comment: vi.fn(),
  report: vi.fn(),
  setFlyArrivedFp: vi.fn(),
}));

vi.mock('../../api', () => ({
  apiClient: {
    footprints: {
      react: vi.fn(),
      comment: mocks.comment,
      delete: vi.fn(),
      deleteComment: vi.fn(),
    },
    reports: { create: mocks.report },
  },
}));

vi.mock('../../store/useUIStore', () => ({
  default: (selector) => selector({ setFlyArrivedFp: mocks.setFlyArrivedFp }),
}));

function renderActions({ requireLogin = vi.fn(() => true) } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const setFootprints = vi.fn();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    setFootprints,
    requireLogin,
    ...renderHook(() => useFootprintActions({
      user: { _id: 'viewer-1' }, requireLogin, setFootprints,
    }), { wrapper }),
  };
}

describe('useFootprintActions conversation mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends reply metadata and replaces shared caches', async () => {
    const updated = { _id: 'fp-1', comments: [{ _id: 'reply-1' }] };
    mocks.comment.mockResolvedValue({ data: { footprint: updated } });
    const harness = renderActions();
    const mapKey = ['footprints', 'map', { scope: 'global' }, 'viewer-1'];
    harness.queryClient.setQueryData(mapKey, { footprints: [{ _id: 'fp-1', comments: [] }] });

    await act(async () => {
      await harness.result.current.handleComment('fp-1', {
        content: 'reply', parentCommentId: 'root-1', replyToCommentId: 'root-1',
      });
    });

    expect(mocks.comment).toHaveBeenCalledWith('fp-1', {
      content: 'reply', parentCommentId: 'root-1', replyToCommentId: 'root-1',
    });
    expect(harness.queryClient.getQueryData(mapKey).footprints[0]).toEqual(updated);
  });

  it('keeps legacy local updates working outside a query provider', async () => {
    const updated = { _id: 'fp-1', comments: [{ _id: 'comment-1' }] };
    const setFootprints = vi.fn();
    const requireLogin = vi.fn(() => true);
    mocks.comment.mockResolvedValue({ data: { footprint: updated } });
    const { result } = renderHook(() => useFootprintActions({
      user: { _id: 'viewer-1' }, requireLogin, setFootprints,
    }));

    await act(async () => {
      await result.current.handleComment('fp-1', 'hello');
    });

    expect(setFootprints).toHaveBeenCalledOnce();
    expect(setFootprints.mock.calls[0][0]([{ _id: 'fp-1', comments: [] }])).toEqual([updated]);
  });

  it('rethrows comment failures so the composer can preserve its draft', async () => {
    mocks.comment.mockRejectedValue(new Error('offline'));
    const harness = renderActions();
    await expect(harness.result.current.handleComment('fp-1', { content: 'keep me' }))
      .rejects.toThrow('offline');
  });

  it('gates and submits a report with the exact target', async () => {
    mocks.report.mockResolvedValue({ data: { report: { _id: 'r-1' } } });
    const harness = renderActions();
    await act(async () => {
      await harness.result.current.handleReport({
        footprintId: 'fp-1', targetType: 'comment', targetId: 'c-1', reason: 'spam',
      });
    });
    expect(harness.requireLogin).toHaveBeenCalledWith({
      type: 'report', footprintId: 'fp-1', targetType: 'comment', targetId: 'c-1',
    });
    expect(mocks.report).toHaveBeenCalledWith({
      footprintId: 'fp-1', targetType: 'comment', targetId: 'c-1', reason: 'spam',
    });
  });
});
