import { useQuery } from '@tanstack/react-query';
import { footprintDto } from '@bliver/contracts';

export const footprintKey = (id: string) => ['footprint', id] as const;
export async function fetchFootprint(id: string) { const response = await fetch(`/api/v1/footprints/${encodeURIComponent(id)}`, { credentials: 'include' }); if (!response.ok) throw new Error('FOOTPRINT_REQUEST_FAILED'); return footprintDto.parse(await response.json()); }
export function useFootprintQuery(id: string, enabled = true) { return useQuery({ queryKey: footprintKey(id), queryFn: () => fetchFootprint(id), enabled, retry: 1, staleTime: 30_000 }); }
