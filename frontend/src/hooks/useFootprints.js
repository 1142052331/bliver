import { useQuery } from '@tanstack/react-query';
import api from '../api';

export default function useFootprints(period = 'week', options = {}) {
  return useQuery({
    queryKey: ['footprints', period],
    queryFn: async ({ signal }) => {
      const res = await api.get(`/api/footprints/today?period=${period}`, { signal });
      return res?.data?.footprints ?? [];
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
