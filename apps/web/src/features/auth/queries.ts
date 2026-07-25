import { useQuery } from '@tanstack/react-query';
import { fetchSession } from './session-api.js';

export const sessionQueryKey = ['auth', 'session'] as const;
export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    retry: false,
    staleTime: 60_000,
  });
}
