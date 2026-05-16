// @feature 自我定位按钮 | Locate Me Button | LocateMeButton
import { useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';

export default function LocateMeButton() {
  const map = useMap();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 1 });
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, [map]);

  return (
    <div className="absolute z-[1000] transform-gpu will-change-transform"
      style={{
        bottom: 'max(80px, calc(env(safe-area-inset-bottom) + 72px))',
        right: 'max(12px, env(safe-area-inset-right))',
      }}>
      <button
        type="button"
        onClick={handleClick}
        className="ios-icon-button w-10 h-10 active:scale-90"
        title="定位到我的位置"
      >
        <LocateFixed className={`w-5 h-5 text-sky-300 ${loading ? 'animate-pulse' : ''}`} />
      </button>
    </div>
  );
}
