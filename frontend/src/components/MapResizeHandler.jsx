import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Calls map.invalidateSize() on window resize — fixes iOS address bar reflow */
export default function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [map]);

  return null;
}
