import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeActivityQuery } from '../../domain/activityQuery';
import useActivityFeed from '../useActivityFeed';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
const authMocks = vi.hoisted(() => ({ getToken: vi.fn(), getUser: vi.fn() }));

vi.mock('../../api', () => ({
  apiClient: { activity: { list: mocks.list } },
}));
vi.mock('../../auth', () => authMocks);

describe('useActivityFeed', () => {
  let queryClient;
  let wrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getToken.mockReturnValue(null);
    authMocks.getUser.mockReturnValue(null);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it('does not cache authenticated activity under guest when viewer is omitted', async () => {
    authMocks.getToken.mockReturnValue('jwt-private');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
    mocks.list.mockResolvedValueOnce({ data: { items: [{ _id: 'private' }], hasMore: false } });

    const { result } = renderHook(() => useActivityFeed({ scope: 'smart' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryCache().getAll()[0].queryKey[2]).toBe('user:viewer-1');
  });

  it.each([
    ['an empty user object', {}],
    ['a role-only user object', { role: 'user' }],
    ['a user with a missing id', { isAdmin: false, name: 'missing-id' }],
  ])('rejects token-backed %s without calling the API or creating a guest cache', (_label, user) => {
    authMocks.getToken.mockReturnValue('jwt-private');
    authMocks.getUser.mockReturnValue(user);

    expect(() => renderHook(() => useActivityFeed({ scope: 'smart' }), { wrapper }))
      .toThrow(/viewer context/i);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('rejects an explicit guest viewer while the request carries authentication', () => {
    authMocks.getToken.mockReturnValue('jwt-private');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });

    expect(() => renderHook(
      () => useActivityFeed({ scope: 'smart' }, 'guest'),
      { wrapper },
    )).toThrow(/does not match/i);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('does not cache a response when authentication changes during the request', async () => {
    mocks.list.mockImplementationOnce(async () => {
      authMocks.getToken.mockReturnValue('jwt-private');
      authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
      return { data: { items: [{ _id: 'private' }], hasMore: false } };
    });

    const hook = renderHook(() => useActivityFeed({ scope: 'smart' }), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));

    expect(queryClient.getQueryData([
      'footprints', 'activity', 'guest', normalizeActivityQuery({ scope: 'smart' }),
    ])).toBeUndefined();
  });

  it('uses a separate guest cache after logout instead of reusing private activity', async () => {
    authMocks.getToken.mockReturnValue('jwt-private');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
    mocks.list
      .mockResolvedValueOnce({ data: { items: [{ _id: 'private' }], hasMore: false } })
      .mockResolvedValueOnce({ data: { items: [{ _id: 'public' }], hasMore: false } });

    const hook = renderHook(() => useActivityFeed({ scope: 'smart' }), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    authMocks.getToken.mockReturnValue(null);
    authMocks.getUser.mockReturnValue(null);
    hook.rerender();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.data?.pages[0].items[0]._id).toBe('public'));

    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey[2]))
      .toEqual(['user:viewer-1', 'guest']);
  });

  it('loads the first canonical page with a cancellation signal', async () => {
    authMocks.getToken.mockReturnValue('jwt-user');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
    const page = {
      items: [{ _id: 'fp-1' }], nextCursor: null, hasMore: false,
      scope: 'smart', usedScopes: ['global'], location: {},
    };
    mocks.list.mockResolvedValueOnce({ data: page });

    const { result } = renderHook(
      () => useActivityFeed({ scope: 'smart', countryCode: 'cn', regionCode: 'cn-sh' }, 'user:viewer-1'),
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
      'footprints', 'activity', 'user:viewer-1',
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
    authMocks.getToken.mockReturnValue('jwt-user');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
    const first = renderHook(() => useActivityFeed({ scope: 'smart' }, 'user:viewer-1'), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    authMocks.getToken.mockReturnValue(null);
    authMocks.getUser.mockReturnValue(null);
    const second = renderHook(() => useActivityFeed({ scope: 'global' }, 'guest'), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    second.unmount();

    await queryClient.invalidateQueries({ queryKey: ['footprints', 'activity'] });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(queryClient.getQueryCache().getAll().every((query) => query.state.isInvalidated)).toBe(true);
  });

  it('does not reuse a regular user cache for an admin with the same id', async () => {
    mocks.list.mockResolvedValue({ data: { items: [], nextCursor: null, hasMore: false } });
    authMocks.getToken.mockReturnValue('jwt-user');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: false });
    const regular = renderHook(
      () => useActivityFeed({ scope: 'smart' }, { _id: 'viewer-1', isAdmin: false }),
      { wrapper },
    );
    await waitFor(() => expect(regular.result.current.isSuccess).toBe(true));
    regular.unmount();
    authMocks.getToken.mockReturnValue('jwt-admin');
    authMocks.getUser.mockReturnValue({ _id: 'viewer-1', isAdmin: true });
    const admin = renderHook(
      () => useActivityFeed({ scope: 'smart' }, { _id: 'viewer-1', isAdmin: true }),
      { wrapper },
    );

    await waitFor(() => expect(admin.result.current.isSuccess).toBe(true));
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey[2])).toEqual([
      'user:viewer-1', 'admin:viewer-1',
    ]);
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
