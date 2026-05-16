// @feature 自动居中地图 | Center Map On Location | CenterOnLocation
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import useUIStore from '../store/useUIStore';

export default function CenterOnLocation() {
  const map = useMap();
  const centerOnLocationId = useUIStore((s) => s.centerOnLocationId);

  const idRef = useRef(centerOnLocationId);
  idRef.current = centerOnLocationId;

  useEffect(() => {
    if (centerOnLocationId === 0) return;

    const loc = useUIStore.getState().centerOnLocation;
    if (!loc?.lat || !loc?.lng) return;

    map.flyTo([loc.lat, loc.lng], 14, { duration: 1 });
  }, [centerOnLocationId, map]);

  return null;
}
