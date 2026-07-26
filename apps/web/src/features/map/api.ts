import { useQuery, type QueryClient } from '@tanstack/react-query';
import { mapFootprintsResponse } from '@bliver/contracts';
import type { MapFootprintQuery } from '@bliver/contracts';
import { mutationHeaders } from '../footprints/csrf.js';

const GLOBAL_MAP_BOUNDS = {
  west: -179.999999,
  south: -89.999999,
  east: 179.999999,
  north: 89.999999,
} as const;
const MAP_PAGE_SIZE = 100;

export const mapFootprintsKey = (query: Pick<Partial<MapFootprintQuery>, 'visibility'>) => [
  'map',
  'footprints',
  'global',
  query.visibility ?? 'all',
] as const;
export async function fetchMapFootprints(
  query: Partial<MapFootprintQuery>,
  signal?: AbortSignal,
): Promise<ReturnType<typeof mapFootprintsResponse.parse>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const response = await fetch(`/api/v1/map/footprints?${params.toString()}`, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('MAP_REQUEST_FAILED');
  return mapFootprintsResponse.parse(await response.json());
}
export async function fetchAllMapFootprints(
  query: Pick<Partial<MapFootprintQuery>, 'visibility'> = {},
  signal?: AbortSignal,
): Promise<ReturnType<typeof mapFootprintsResponse.parse>> {
  const items = new Map<string, ReturnType<typeof mapFootprintsResponse.parse>['items'][number]>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let viewerAuthenticated: boolean | undefined;

  do {
    const page = await fetchMapFootprints({
      ...GLOBAL_MAP_BOUNDS,
      limit: MAP_PAGE_SIZE,
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(cursor ? { cursor } : {}),
    }, signal);
    viewerAuthenticated = page.viewerAuthenticated;
    for (const item of page.items) items.set(item.id, item);
    cursor = page.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error('MAP_CURSOR_LOOP');
    if (cursor) cursors.add(cursor);
  } while (cursor);

  return { items: [...items.values()], nextCursor: null, viewerAuthenticated: viewerAuthenticated ?? false };
}

export function useMapFootprintsQuery(
  query: Pick<Partial<MapFootprintQuery>, 'visibility'>,
  enabled = true,
) {
  return useQuery({
    queryKey: mapFootprintsKey(query),
    queryFn: ({ signal }) => fetchAllMapFootprints(query, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
export function invalidateMapQueries(client: QueryClient): Promise<void> { return client.invalidateQueries({ queryKey: ['map', 'footprints'] }).then(() => undefined); }
export async function markMapFootprintRead(footprintId: string): Promise<boolean> {
  const response = await fetch(`/api/v1/footprints/${encodeURIComponent(footprintId)}/read`, {
    method: 'POST',
    credentials: 'include',
    headers: mutationHeaders({}),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error('MAP_READ_REQUEST_FAILED');
  return true;
}
