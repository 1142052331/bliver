import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../api';
import { getToken, getUser } from '../auth';
import {
  activityQueryKey,
  canonicalViewerIdentity,
  normalizeActivityQuery,
} from '../domain/activityQuery';

function resolveViewer(viewer) {
  const token = getToken();
  const user = getUser();
  if (token) {
    if (!user) throw new Error('Authenticated activity feed requires a viewer context');
  } else if (user) {
    throw new Error('Activity viewer context requires an authentication token');
  }

  const authenticatedViewer = token ? user : 'guest';
  if (viewer !== undefined
    && canonicalViewerIdentity(viewer) !== canonicalViewerIdentity(authenticatedViewer)) {
    throw new Error('Activity viewer context does not match the current authentication state');
  }
  return authenticatedViewer;
}

export default function useActivityFeed(query = {}, viewer) {
  const normalized = normalizeActivityQuery(query);
  const resolvedViewer = resolveViewer(viewer);
  const viewerIdentity = canonicalViewerIdentity(resolvedViewer);

  return useInfiniteQuery({
    queryKey: activityQueryKey(normalized, resolvedViewer),
    queryFn: async ({ pageParam, signal }) => {
      const response = await apiClient.activity.list(normalized, pageParam, { signal });
      if (canonicalViewerIdentity(resolveViewer()) !== viewerIdentity) {
        throw new Error('Authentication changed while loading activity');
      }
      return response.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (
      lastPage?.hasMore && typeof lastPage.nextCursor === 'string' && lastPage.nextCursor
        ? lastPage.nextCursor
        : undefined
    ),
    staleTime: 60_000,
  });
}
