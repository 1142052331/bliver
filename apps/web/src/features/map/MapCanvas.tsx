import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapCanvasItem { readonly id: string; readonly displayPoint: { readonly lat: number; readonly lng: number }; readonly author: { readonly name: string }; }
export interface MapViewportBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number; }
function ViewportReporter({ onViewportChange }: { readonly onViewportChange?: (bounds: MapViewportBounds) => void }) { useMapEvents({ moveend(event) { const bounds = event.target.getBounds(); onViewportChange?.({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }); } }); return null; }
export function MapCanvas({ items, selectedId, onSelect, onViewportChange, viewport }: { readonly items: readonly MapCanvasItem[]; readonly selectedId?: string; readonly onSelect?: (id: string) => void; readonly onViewportChange?: (bounds: MapViewportBounds) => void; readonly viewport?: MapViewportBounds }) {
  const center: [number, number] = viewport ? [(viewport.south + viewport.north) / 2, (viewport.west + viewport.east) / 2] : [31.23, 121.47];
  const bounds = viewport ? [[viewport.south, viewport.west], [viewport.north, viewport.east]] as [[number, number], [number, number]] : undefined;
  return <div data-testid="map-canvas" className="map-canvas"><MapContainer {...(bounds ? { bounds } : { center, zoom: 11 })} scrollWheelZoom><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ViewportReporter {...(onViewportChange ? { onViewportChange } : {})} />{items.map((item) => <CircleMarker key={item.id} center={[item.displayPoint.lat, item.displayPoint.lng]} radius={selectedId === item.id ? 12 : 8} pathOptions={{ color: selectedId === item.id ? '#C54B36' : '#173B31', fillColor: '#A9C9BF', fillOpacity: 0.9 }} eventHandlers={{ click: () => onSelect?.(item.id) }}><Popup>{item.author.name}</Popup></CircleMarker>)}</MapContainer></div>;
}
