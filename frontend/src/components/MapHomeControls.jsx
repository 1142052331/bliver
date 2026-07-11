import { Crosshair, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useMap } from 'react-leaflet';

const DEFAULT_CENTER = [33.5597, 133.5311];

export default function MapHomeControls({ footprints }) {
  const map = useMap();
  const [locationError, setLocationError] = useState('');

  const resetView = () => {
    const latest = footprints.find((footprint) => footprint.location?.lat && footprint.location?.lng);
    setLocationError('');
    map.flyTo(latest ? [latest.location.lat, latest.location.lng] : DEFAULT_CENTER, latest ? 11 : 6, { duration: 0.6 });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError('此浏览器不支持定位');
      return;
    }

    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14, { duration: 0.8 }),
      () => setLocationError('无法获取当前位置，请检查定位权限'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <div className="bliver-map-controls" aria-label="地图控制">
      <div className="bliver-map-controls__summary" aria-live="polite">{footprints.length} 条足迹</div>
      <div className="bliver-map-controls__actions">
        <button type="button" onClick={locate} className="bliver-map-controls__button" aria-label="定位到我的位置" title="定位到我的位置">
          <Crosshair size={20} />
        </button>
        <button type="button" onClick={resetView} className="bliver-map-controls__button" aria-label="回到足迹视野" title="回到足迹视野">
          <RotateCcw size={19} />
        </button>
      </div>
      {locationError && <p className="bliver-map-controls__error" role="status">{locationError}</p>}
    </div>
  );
}
