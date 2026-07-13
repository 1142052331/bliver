import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export default function FlyToFootprint({ footprints, activeFootprintId, onArrive }) {
  const map = useMap();
  const footprintsRef = useRef(footprints);
  const onArriveRef = useRef(onArrive);
  const flyingRef = useRef(false);

  useEffect(() => {
    footprintsRef.current = footprints;
    onArriveRef.current = onArrive;
  }, [footprints, onArrive]);

  useEffect(() => {
    if (!activeFootprintId) return;

    const fp = footprintsRef.current.find((footprint) => footprint._id === activeFootprintId);
    if (!fp?.location?.lat || !fp?.location?.lng) return;

    flyingRef.current = true;
    map.flyTo([fp.location.lat, fp.location.lng], 16, { duration: 1.2 });

    const onMoveEnd = () => {
      if (flyingRef.current) {
        flyingRef.current = false;
        const latest = footprintsRef.current.find((footprint) => footprint._id === activeFootprintId);
        if (latest && onArriveRef.current) onArriveRef.current(latest);
      }
    };

    map.on('moveend', onMoveEnd);

    return () => {
      map.off('moveend', onMoveEnd);
      map.stop(); // Cancel in-progress flyTo animation
    };
  }, [activeFootprintId, map]);

  return null;
}
