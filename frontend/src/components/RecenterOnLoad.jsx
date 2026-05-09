import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * 页面首次加载时将地图居中到目标足迹或最新足迹位置。
 * 仅在组件挂载时执行一次，不做后续追踪。
 */
export default function RecenterOnLoad({ footprints, targetId }) {
  const map = useMap();

  useEffect(() => {
    if (targetId) {
      const fp = footprints.find((f) => f._id === targetId);
      if (fp?.location?.lat) {
        setTimeout(() => {
          map.setView([fp.location.lat, fp.location.lng], 14);
        }, 500);
      }
    } else if (footprints.length > 0) {
      const last = footprints[0];
      if (last?.location?.lat) {
        map.setView([last.location.lat, last.location.lng], map.getZoom());
      }
    }
  }, []);

  return null;
}
