import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Surface } from '@bliver/ui';
import { MapCanvas, type MapCanvasItem } from './MapCanvas.js';
import './map.css';

export interface MapItem extends MapCanvasItem { readonly visibility: 'public' | 'friends' | 'private'; readonly locationPrecision: 'precise' | 'approximate'; readonly publishedAt: string; }
export type MapState = 'loading' | 'error' | 'empty' | 'ready';
export function MapRoute({ state = 'ready', items = [], onRetry }: { readonly state?: MapState; readonly items?: readonly MapItem[]; readonly onRetry?: () => void }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('footprint');
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? items[0], [items, selectedId]);
  useEffect(() => { if (selectedId && !selected) { const next = new URLSearchParams(params); next.delete('footprint'); setParams(next, { replace: true }); } }, [params, selected, selectedId, setParams]);
  if (state === 'loading') return <section className="map-route" aria-busy="true"><div role="status">Loading map</div></section>;
  if (state === 'error') return <section className="map-route map-route--state"><Surface><h1>Map unavailable</h1><p>We could not load footprints.</p><Button onClick={onRetry}>Try again</Button></Surface></section>;
  return <section className="map-route"><h1 className="map-route__title">Map</h1><p className="map-route__migration">Feature pending migration into the V2 module boundary.</p><MapCanvas items={items} {...(selectedId ? { selectedId } : {})} onSelect={(id) => { const next = new URLSearchParams(params); next.set('footprint', id); setParams(next); }} /><div className="map-route__controls"><Button variant="secondary" aria-label="Search places">Search</Button><Button variant="secondary" aria-label="Locate me">Locate</Button></div>{state === 'empty' ? <Surface className="map-route__empty"><h2>No footprints here yet</h2><p>Try another area or publish the first moment.</p></Surface> : null}{selected ? <Surface className="map-route__preview" aria-label="Footprint preview"><strong>{selected.author.name}</strong><p>{selected.visibility === 'public' ? 'Public' : selected.visibility === 'friends' ? 'Friends only' : 'Only you'}</p><p>{selected.locationPrecision === 'precise' ? 'Precise location' : 'Approximate location'}</p></Surface> : null}</section>;
}
