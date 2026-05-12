import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api';

export default function useFootprints(period = 'week', userId = null, options = {}) {
  return useQuery({
    queryKey: ['footprints', period, userId],
    queryFn: async ({ signal }) => {
      const res = await apiClient.footprints.list({ period, userId }, { signal });
      return res?.data?.footprints ?? [];
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
