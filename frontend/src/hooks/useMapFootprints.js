import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api';
import { mapQueryKey } from '../domain/mapQuery';

export default function useMapFootprints(query) {
  return useQuery({
    queryKey: mapQueryKey(query),
    queryFn: async ({ signal }) => (
      await apiClient.map.list(query, { signal })
    ).data,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}
