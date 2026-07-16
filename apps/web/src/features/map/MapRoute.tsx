import { useEffect, useMemo } from 'react';
import { placeSearchResponse } from '@bliver/contracts';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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
  const viewport = { west: Number(params.get('west') ?? 120), south: Number(params.get('south') ?? 30), east: Number(params.get('east') ?? 122), north: Number(params.get('north') ?? 32) };
  const remote = useMapFootprintsQuery({ ...viewport, limit: Number(params.get('limit') ?? 50), ...(params.get('cursor') ? { cursor: params.get('cursor') as string } : {}), ...(params.get('visibility') ? { visibility: params.get('visibility') as 'public' | 'friends' | 'private' } : {}) }, loadFromApi);
  const visibleItems = useMemo(() => loadFromApi ? (remote.data?.items ?? []) as MapItem[] : items, [items, loadFromApi, remote.data?.items]);
  const selectedId = params.get('footprint');
  const selected = useMemo(() => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0], [visibleItems, selectedId]);
  useEffect(() => { if (selectedId && !selected) { const next = new URLSearchParams(params); next.delete('footprint'); setParams(next, { replace: true }); } }, [params, selected, selectedId, setParams]);
  const retry = (): void => { onRetry?.(); if (loadFromApi) void remote.refetch(); };
  const search = async (query: string): Promise<void> => { const next = new URLSearchParams(params); next.set('search', 'open'); if (query) { try { const response = await fetch(`/api/v1/places/search?q=${encodeURIComponent(query)}`, { credentials: 'include' }); if (response.ok) { const result = placeSearchResponse.parse(await response.json()); const first = result.items[0]; if (first) { const span = 0.02; next.set('west', String(first.lng - span)); next.set('east', String(first.lng + span)); next.set('south', String(first.lat - span)); next.set('north', String(first.lat + span)); next.set('lat', String(first.lat)); next.set('lng', String(first.lng)); } } } catch { next.set('searchError', '1'); } } setParams(next); };
  const locate = (): Promise<void> => new Promise((resolve) => { const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined; if (!geolocation) { const next = new URLSearchParams(params); next.set('locateError', '1'); setParams(next); resolve(); return; } geolocation.getCurrentPosition(({ coords }) => { const span = 0.02; const next = new URLSearchParams(params); next.set('west', String(coords.longitude - span)); next.set('east', String(coords.longitude + span)); next.set('south', String(coords.latitude - span)); next.set('north', String(coords.latitude + span)); next.set('lat', String(coords.latitude)); next.set('lng', String(coords.longitude)); next.delete('locateError'); setParams(next); resolve(); }, () => { const next = new URLSearchParams(params); next.set('locateError', '1'); setParams(next); resolve(); }); });
  const remoteLoading = loadFromApi && remote.isLoading;
  const remoteError = loadFromApi && remote.isError;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (state === 'loading' || remoteLoading) return <section className="map-route" aria-busy="true"><div role="status">Loading map</div></section>;
  if (state === 'error' || remoteError) return <section className="map-route map-route--state"><Surface><h1>{offline ? 'Map offline' : 'Map unavailable'}</h1><p>{offline ? 'Reconnect to load footprints. Your private map data is not cached.' : 'We could not load footprints.'}</p><Button onClick={retry}>Try again</Button></Surface></section>;
  return <section className="map-route"><h1 className="map-route__title">Map</h1><MapCanvas items={visibleItems} viewport={viewport} {...(selectedId ? { selectedId } : {})} onViewportChange={(bounds) => { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(bounds)) next.set(key, String(value)); next.set('lat', String((bounds.south + bounds.north) / 2)); next.set('lng', String((bounds.west + bounds.east) / 2)); setParams(next, { replace: true }); }} onSelect={(id) => { const next = new URLSearchParams(params); const item = visibleItems.find((candidate) => candidate.id === id); next.set('footprint', id); next.set('sheet', 'preview'); if (item) { next.set('lat', String(item.displayPoint.lat)); next.set('lng', String(item.displayPoint.lng)); } setParams(next); }} /><MapControls visibility={params.get('visibility') ?? ''} onSearch={(query) => void search(query)} onLocate={locate} onVisibilityChange={(value) => { const next = new URLSearchParams(params); if (value) next.set('visibility', value); else next.delete('visibility'); next.delete('cursor'); setParams(next); }} />{state === 'empty' || (loadFromApi && !remote.isLoading && !remote.data?.items.length) ? <Surface className="map-route__empty"><h2>No footprints here yet</h2><p>Try another area or publish the first moment.</p></Surface> : null}{selected ? <Surface className="map-route__preview" aria-label="Footprint preview"><strong>{selected.author.name}</strong><p>{selected.visibility === 'public' ? 'Public' : selected.visibility === 'friends' ? 'Friends only' : 'Only you'}</p><p>{selected.locationPrecision === 'precise' ? 'Precise location' : 'Approximate location'}</p><Link to={`/footprints/${selected.id}`}>Open footprint</Link></Surface> : null}</section>;
}
