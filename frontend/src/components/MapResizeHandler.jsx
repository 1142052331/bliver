import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Calls map.invalidateSize() on resize, orientation change, and wake-from-background */
export default function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => map.invalidateSize(), 100);
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
