import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../api';
import { activityQueryKey, normalizeActivityQuery } from '../domain/activityQuery';

export default function useActivityFeed(query = {}, viewerKey = 'guest') {
  const normalized = normalizeActivityQuery(query);

  return useInfiniteQuery({
    queryKey: activityQueryKey(normalized, viewerKey),
    queryFn: async ({ pageParam, signal }) => (
      await apiClient.activity.list(normalized, pageParam, { signal })
    ).data,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (
      lastPage?.hasMore && typeof lastPage.nextCursor === 'string' && lastPage.nextCursor
        ? lastPage.nextCursor
        : undefined
    ),
    staleTime: 60_000,
  });
}
