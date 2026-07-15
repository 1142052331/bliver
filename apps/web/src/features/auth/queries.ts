import { useQuery } from '@tanstack/react-query';
import { authApi } from './api.js';

export const sessionQueryKey = ['auth', 'session'] as const;
export function useSessionQuery() {
  return useQuery({ queryKey: sessionQueryKey, queryFn: authApi.session, retry: false, staleTime: 60_000 });
}
