import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeActivityQuery } from '../../domain/activityQuery';
import useActivityFeed from '../useActivityFeed';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../api', () => ({
  apiClient: { activity: { list: mocks.list } },
}));

describe('useActivityFeed', () => {
  let queryClient;
  let wrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it('loads the first canonical page with a cancellation signal', async () => {
    const page = {
      items: [{ _id: 'fp-1' }], nextCursor: null, hasMore: false,
      scope: 'smart', usedScopes: ['global'], location: {},
    };
    mocks.list.mockResolvedValueOnce({ data: page });

    const { result } = renderHook(
      () => useActivityFeed({ scope: 'smart', countryCode: 'cn', regionCode: 'cn-sh' }, 'viewer-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.list).toHaveBeenCalledWith(
      {
        scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
      },
      undefined,
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data.pages).toEqual([page]);
    expect(queryClient.getQueryCache().getAll()[0].queryKey).toEqual([
      'footprints', 'activity', 'viewer-1',
      { scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 20 },
    ]);
  });

  it('loads subsequent pages from the opaque next cursor', async () => {
    mocks.list
      .mockResolvedValueOnce({
        data: { items: [{ _id: 'fp-2' }], nextCursor: 'opaque+/=', hasMore: true },
      })
      .mockResolvedValueOnce({
        data: { items: [{ _id: 'fp-1' }], nextCursor: null, hasMore: false },
      });
    const query = normalizeActivityQuery({ scope: 'global', limit: 1 });
    const { result } = renderHook(() => useActivityFeed(query, 'guest'), { wrapper });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data.pages).toHaveLength(2));
    expect(mocks.list).toHaveBeenNthCalledWith(2, query, 'opaque+/=', {
      signal: expect.any(AbortSignal),
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not request another page when hasMore lacks a usable cursor', async () => {
    mocks.list.mockResolvedValueOnce({
      data: { items: [], nextCursor: null, hasMore: true },
    });
    const { result } = renderHook(() => useActivityFeed({ scope: 'global' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('keeps all viewer variants compatible with prefix invalidation', async () => {
    mocks.list.mockResolvedValue({ data: { items: [], nextCursor: null, hasMore: false } });
    const first = renderHook(() => useActivityFeed({ scope: 'smart' }, 'viewer-1'), { wrapper });
    const second = renderHook(() => useActivityFeed({ scope: 'global' }, 'guest'), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess && second.result.current.isSuccess).toBe(true));
    first.unmount();
    second.unmount();

    await queryClient.invalidateQueries({ queryKey: ['footprints', 'activity'] });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(queryClient.getQueryCache().getAll().every((query) => query.state.isInvalidated)).toBe(true);
  });

  it('rejects invalid fixed scopes before creating a query or calling the API', () => {
    expect(() => renderHook(
      () => useActivityFeed({ scope: 'region', regionCode: 'CN-SH' }, 'guest'),
      { wrapper },
    )).toThrow(/countryCode/);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
