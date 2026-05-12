import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/** Calls map.invalidateSize() on resize, orientation change, and wake-from-background */
export default function MapResizeHandler() {
  const map = useMap();
  const invalidating = useRef(false);

  useEffect(() => {
    const invalidate = () => {
      if (invalidating.current) return;
      invalidating.current = true;
      map.invalidateSize();
      setTimeout(() => { invalidating.current = false; }, 200);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') invalidate();
    };

    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [map]);

  return null;
}
