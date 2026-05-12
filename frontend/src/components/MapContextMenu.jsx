import { useState, useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import useUIStore from '../store/useUIStore';

const LONG_PRESS_MS = 600;
const MOVE_THRESHOLD = 10; // px — cancel long-press if finger moves more than this

export default function MapContextMenu() {
  const map = useMap();
  const [menu, setMenu] = useState(null);
  const longPressTimer = useRef(null);
  const touchStartPos = useRef(null);
  const touchStartLatLng = useRef(null);

  // ── Desktop: right-click ──
  const handleContextMenu = useCallback((e) => {
    e.originalEvent.preventDefault();
    const { lat, lng } = e.latlng;
    const point = map.latLngToContainerPoint([lat, lng]);
    setMenu({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), x: point.x, y: point.y });
  }, [map]);

  // ── Mobile: long-press ──
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    // Convert screen point to latlng
    const latlng = map.containerPointToLatLng([touch.clientX, touch.clientY]);
    touchStartLatLng.current = latlng;

    longPressTimer.current = setTimeout(() => {
      const latlng = touchStartLatLng.current;
      if (!latlng) return;
      const point = map.latLngToContainerPoint([latlng.lat, latlng.lng]);
      setMenu({
        lat: Number(latlng.lat.toFixed(6)),
        lng: Number(latlng.lng.toFixed(6)),
        x: point.x,
        y: point.y,
      });
    }, LONG_PRESS_MS);
  }, [map]);

  const handleTouchMove = useCallback((e) => {
    if (!touchStartPos.current || !e.touches.length) return;
    const dx = e.touches[0].clientX - touchStartPos.current.x;
    const dy = e.touches[0].clientY - touchStartPos.current.y;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    touchStartPos.current = null;
  }, []);

  const handleTeleport = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!menu) return;
    useUIStore.getState().setPendingCheckInLocation({ lat: menu.lat, lng: menu.lng });
    useUIStore.getState().openCheckIn();
    setMenu(null);
  }, [menu]);

  // Close menu on interaction
  useEffect(() => {
    const close = () => setMenu(null);
    map.on('click', close);
    map.on('dragstart', close);
    map.on('zoomstart', close);
    return () => {
      map.off('click', close);
      map.off('dragstart', close);
      map.off('zoomstart', close);
    };
  }, [map]);

  // Right-click (desktop)
  useEffect(() => {
    map.on('contextmenu', handleContextMenu);
    return () => { map.off('contextmenu', handleContextMenu); };
  }, [map, handleContextMenu]);

  // Long-press (mobile) — attach to map container
  useEffect(() => {
    const container = map.getContainer();
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [map, handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!menu) return null;

  return (
    <div
      className="absolute z-[1500] pointer-events-auto"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        onClick={handleTeleport}
        className="flex items-center gap-2 px-3 py-2 text-xs font-bold bg-gray-900/95 backdrop-blur border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/20 hover:border-red-500/50 transition-all shadow-2xl whitespace-nowrap active:scale-95"
      >
        <MapPin className="w-3.5 h-3.5" />
        在此打卡（管理员）
      </button>
    </div>
  );
}
