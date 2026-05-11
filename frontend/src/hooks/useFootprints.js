import { useQuery } from '@tanstack/react-query';
import api from '../api';

export default function useFootprints(period = 'week', userId = null, options = {}) {
  return useQuery({
    queryKey: ['footprints', period, userId],
    queryFn: async ({ signal }) => {
      let url = `/api/footprints/today?period=${period}`;
      if (userId) url += `&userId=${userId}`;
      const res = await api.get(url, { signal });
      return res?.data?.footprints ?? [];
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
