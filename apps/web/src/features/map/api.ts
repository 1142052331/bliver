import { useQuery, type QueryClient } from '@tanstack/react-query';
import { mapFootprintsResponse } from '@bliver/contracts';
import type { MapFootprintQuery } from '@bliver/contracts';

export const mapFootprintsKey = (query: Partial<MapFootprintQuery>) => ['map', 'footprints', query] as const;
export async function fetchMapFootprints(query: Partial<MapFootprintQuery>): Promise<ReturnType<typeof mapFootprintsResponse.parse>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const response = await fetch(`/api/v1/map/footprints?${params.toString()}`, { credentials: 'include' });
  if (!response.ok) throw new Error('MAP_REQUEST_FAILED');
  return mapFootprintsResponse.parse(await response.json());
}
export function useMapFootprintsQuery(query: Partial<MapFootprintQuery>, enabled = true) { return useQuery({ queryKey: mapFootprintsKey(query), queryFn: () => fetchMapFootprints(query), enabled, staleTime: 15_000, retry: 1 }); }
export function invalidateMapQueries(client: QueryClient): Promise<void> { return client.invalidateQueries({ queryKey: ['map', 'footprints'] }).then(() => undefined); }
