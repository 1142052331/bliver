import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapCanvasItem { readonly id: string; readonly displayPoint: { readonly lat: number; readonly lng: number }; readonly author: { readonly name: string }; }
function ViewportReporter({ onViewportChange }: { readonly onViewportChange?: (bounds: LatLngBoundsExpression) => void }) { useMapEvents({ moveend(event) { onViewportChange?.(event.target.getBounds().toBBoxString().split(',').map(Number) as unknown as LatLngBoundsExpression); } }); return null; }
export function MapCanvas({ items, selectedId, onSelect, onViewportChange }: { readonly items: readonly MapCanvasItem[]; readonly selectedId?: string; readonly onSelect?: (id: string) => void; readonly onViewportChange?: (bounds: LatLngBoundsExpression) => void }) {
  return <div data-testid="map-canvas" className="map-canvas"><MapContainer center={[31.23, 121.47]} zoom={11} scrollWheelZoom><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ViewportReporter {...(onViewportChange ? { onViewportChange } : {})} />{items.map((item) => <CircleMarker key={item.id} center={[item.displayPoint.lat, item.displayPoint.lng]} radius={selectedId === item.id ? 12 : 8} pathOptions={{ color: selectedId === item.id ? '#C54B36' : '#173B31', fillColor: '#A9C9BF', fillOpacity: 0.9 }} eventHandlers={{ click: () => onSelect?.(item.id) }}><Popup>{item.author.name}</Popup></CircleMarker>)}</MapContainer></div>;
}
