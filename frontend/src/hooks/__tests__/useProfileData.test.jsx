import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useProfileData from '../useProfileData';
import { apiClient } from '../../api';

let currentUser;

vi.mock('../../auth', () => ({
  getUser: () => currentUser,
}));

vi.mock('../../api', () => ({
  apiClient: {
    users: {
      profile: vi.fn(),
      updateProfile: vi.fn(),
      updateBanner: vi.fn(),
    },
  },
}));

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useProfileData', () => {
  beforeEach(() => {
    currentUser = { _id: 'owner-1', name: '阿森', avatarUrl: '/owner.jpg' };
    vi.clearAllMocks();
    apiClient.users.profile.mockResolvedValue({
      data: {
        user: { ...currentUser, profileVisitors: [] },
        footprints: [{ _id: 'fp-1', createdAt: '2026-07-14T00:00:00.000Z', reactions: [] }],
      },
    });
  });

  it('reuses fresh profile data when the same profile is reopened', async () => {
    const { queryClient, wrapper } = createHarness();
    const first = renderHook(() => useProfileData('owner-1'), { wrapper });

    await waitFor(() => expect(first.result.current.footprints).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useProfileData('owner-1'), { wrapper });
    await waitFor(() => expect(second.result.current.footprints).toHaveLength(1));

    expect(apiClient.users.profile).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toContainEqual([
      'profile', 'owner-1', 'owner-1',
    ]);
  });

  it('shows the authenticated owner identity while the core profile request is pending', () => {
    apiClient.users.profile.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useProfileData('owner-1'), { wrapper });

    expect(result.current.profile).toMatchObject({ _id: 'owner-1', name: '阿森' });
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
  });

  it('keeps profile caches isolated when the authenticated viewer changes', async () => {
    const { queryClient, wrapper } = createHarness();
    const { result, rerender } = renderHook(({ id }) => useProfileData(id), {
      initialProps: { id: 'target-1' },
      wrapper,
    });
    await waitFor(() => expect(result.current.profile).toBeTruthy());

    act(() => { currentUser = { _id: 'viewer-2', name: '小林' }; });
    rerender({ id: 'target-1' });
    await waitFor(() => expect(apiClient.users.profile).toHaveBeenCalledTimes(2));

    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toEqual(
      expect.arrayContaining([
        ['profile', 'target-1', 'owner-1'],
        ['profile', 'target-1', 'viewer-2'],
      ]),
    );
  });
});
