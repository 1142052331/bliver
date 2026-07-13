import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * 当 targetId 变化时，将地图 panTo 到目标足迹位置。
 * 到达后（900ms 延迟）调用 onArrive 回调打开详情。
 * 使用 ref 避免闭包中 footprints 过时。
 */
export default function PanToTarget({ targetId, footprints, onArrive }) {
  const map = useMap();
  const footprintsRef = useRef(footprints);
  const onArriveRef = useRef(onArrive);

  useEffect(() => {
    footprintsRef.current = footprints;
    onArriveRef.current = onArrive;
  }, [footprints, onArrive]);

  useEffect(() => {
    if (!targetId) return;
    const fp = footprintsRef.current.find((footprint) => footprint._id === targetId);
    if (!fp?.location?.lat || !fp?.location?.lng) return;

    map.panTo([fp.location.lat, fp.location.lng], { animate: true, duration: 0.8 });

    const timer = setTimeout(() => {
      const latest = footprintsRef.current.find((footprint) => footprint._id === targetId);
      if (latest) onArriveRef.current(latest);
    }, 900);

    return () => clearTimeout(timer);
  }, [targetId, map]);

  return null;
}
