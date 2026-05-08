import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export default function FlyToFootprint({ footprints, activeFootprintId, onArrive }) {
  const map = useMap();
  const footprintsRef = useRef(footprints);
  footprintsRef.current = footprints;
  const flyingRef = useRef(false);

  useEffect(() => {
    if (!activeFootprintId) return;

    const fp = footprintsRef.current.find((f) => f._id === activeFootprintId);
    if (!fp?.location?.lat || !fp?.location?.lng) return;

    flyingRef.current = true;
    map.flyTo([fp.location.lat, fp.location.lng], 16, { duration: 1.2 });

    const onMoveEnd = () => {
      if (flyingRef.current) {
        flyingRef.current = false;
        if (fp && onArrive) onArrive(fp);
      }
    };

    map.on('moveend', onMoveEnd);

    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [activeFootprintId]);

  return null;
}
