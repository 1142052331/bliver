import { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button, Surface } from '@bliver/ui';
import { MapCanvas, type MapCanvasItem } from './MapCanvas.js';
import { MapControls } from './MapControls.js';
import { useMapFootprintsQuery } from './api.js';
import { connectMapRealtime } from './realtime.js';
import './map.css';

export interface MapItem extends MapCanvasItem { readonly visibility: 'public' | 'friends' | 'private'; readonly locationPrecision: 'precise' | 'approximate'; readonly publishedAt: string; }
export type MapState = 'loading' | 'error' | 'empty' | 'ready';
interface MapRouteProps { readonly state?: MapState; readonly items?: readonly MapItem[]; readonly onRetry?: () => void; readonly loadFromApi?: boolean; }
export function MapRoute(props: MapRouteProps) { const client = useMemo(() => new QueryClient(), []); return <QueryClientProvider client={client}><MapRouteBody {...props} /></QueryClientProvider>; }
function MapRouteBody({ state = 'ready', items = [], onRetry, loadFromApi = false }: MapRouteProps) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  useEffect(() => loadFromApi ? connectMapRealtime(queryClient) : undefined, [loadFromApi, queryClient]);
  const remote = useMapFootprintsQuery({ west: Number(params.get('west') ?? 120), south: Number(params.get('south') ?? 30), east: Number(params.get('east') ?? 122), north: Number(params.get('north') ?? 32), limit: Number(params.get('limit') ?? 50), ...(params.get('cursor') ? { cursor: params.get('cursor') as string } : {}), ...(params.get('visibility') ? { visibility: params.get('visibility') as 'public' | 'friends' | 'private' } : {}) }, loadFromApi);
  const visibleItems = useMemo(() => loadFromApi ? (remote.data?.items ?? []) as MapItem[] : items, [items, loadFromApi, remote.data?.items]);
  const selectedId = params.get('footprint');
  const selected = useMemo(() => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0], [visibleItems, selectedId]);
  useEffect(() => { if (selectedId && !selected) { const next = new URLSearchParams(params); next.delete('footprint'); setParams(next, { replace: true }); } }, [params, selected, selectedId, setParams]);
  if (state === 'loading') return <section className="map-route" aria-busy="true"><div role="status">Loading map</div></section>;
  if (state === 'error') return <section className="map-route map-route--state"><Surface><h1>Map unavailable</h1><p>We could not load footprints.</p><Button onClick={onRetry}>Try again</Button></Surface></section>;
  return <section className="map-route"><h1 className="map-route__title">Map</h1><MapCanvas items={visibleItems} {...(selectedId ? { selectedId } : {})} onViewportChange={(bounds) => { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(bounds)) next.set(key, String(value)); setParams(next, { replace: true }); }} onSelect={(id) => { const next = new URLSearchParams(params); next.set('footprint', id); next.set('sheet', 'preview'); setParams(next); }} /><MapControls visibility={params.get('visibility') ?? ''} onVisibilityChange={(value) => { const next = new URLSearchParams(params); if (value) next.set('visibility', value); else next.delete('visibility'); next.delete('cursor'); setParams(next); }} />{state === 'empty' || (loadFromApi && !remote.isLoading && !remote.data?.items.length) ? <Surface className="map-route__empty"><h2>No footprints here yet</h2><p>Try another area or publish the first moment.</p></Surface> : null}{loadFromApi && remote.isError ? <Surface className="map-route__preview" role="alert"><strong>Map unavailable</strong><p>Try again when your connection is restored.</p><Button onClick={onRetry}>Try again</Button></Surface> : null}{selected ? <Surface className="map-route__preview" aria-label="Footprint preview"><strong>{selected.author.name}</strong><p>{selected.visibility === 'public' ? 'Public' : selected.visibility === 'friends' ? 'Friends only' : 'Only you'}</p><p>{selected.locationPrecision === 'precise' ? 'Precise location' : 'Approximate location'}</p></Surface> : null}</section>;
}
