import { useQuery } from '@tanstack/react-query';

export const sessionQueryKey = ['auth', 'session'] as const;
export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async () => (await import('./api.js')).authApi.session(),
    retry: false,
    staleTime: 60_000,
  });
}
