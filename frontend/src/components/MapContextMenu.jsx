import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import useUIStore from '../store/useUIStore';

const LONG_PRESS_MS = 600;
const MOVE_THRESHOLD = 10;

export default function MapContextMenu() {
  const map = useMap();
  const [menu, setMenu] = useState(null);
  const longPressTimer = useRef(null);
  const touchStartPos = useRef(null);
  const touchStartLatLng = useRef(null);

  /** Convert lat/lng to page-relative pixel coords (for portal rendering in body) */
  const latLngToPageXY = useCallback((lat, lng) => {
    const point = map.latLngToContainerPoint([lat, lng]);
    const rect = map.getContainer().getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  }, [map]);

  // ── Desktop: right-click ──
  const handleContextMenu = useCallback((e) => {
    e.originalEvent.preventDefault();
    const { lat, lng } = e.latlng;
    const page = latLngToPageXY(lat, lng);
    setMenu({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), ...page });
  }, [latLngToPageXY]);

  // ── Mobile: long-press ──
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchStartLatLng.current = map.containerPointToLatLng([touch.clientX, touch.clientY]);

    longPressTimer.current = setTimeout(() => {
      const latlng = touchStartLatLng.current;
      if (!latlng) return;
      const page = latLngToPageXY(latlng.lat, latlng.lng);
      setMenu({
        lat: Number(latlng.lat.toFixed(6)),
        lng: Number(latlng.lng.toFixed(6)),
        ...page,
      });
    }, LONG_PRESS_MS);
  }, [map, latLngToPageXY]);

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

  const handleTeleport = useCallback(() => {
    if (!menu) return;
    useUIStore.getState().setPendingCheckInLocation({ lat: menu.lat, lng: menu.lng });
    useUIStore.getState().openCheckIn();
    setMenu(null);
  }, [menu]);

  // Close menu on map interaction
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

  // Render in document.body — completely outside Leaflet's DOM tree
  return createPortal(
    <button
      onClick={handleTeleport}
      className="fixed z-[2000] flex items-center gap-2 px-3 py-2 text-xs font-bold bg-gray-900/95 backdrop-blur border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/20 hover:border-red-500/50 transition-all shadow-2xl whitespace-nowrap active:scale-95 touch-none select-none"
      style={{ left: menu.x, top: menu.y, transform: 'translate(-50%, -120%)' }}
    >
      <MapPin className="w-3.5 h-3.5" />
      在此打卡（管理员）
    </button>,
    document.body
  );
}
