import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Map, MapPin, Navigation, X } from 'lucide-react';
import { useMap } from 'react-leaflet';
import { CLUSTER_EXPANSION_ZOOM } from '../ClusterMarkers';

function compareFootprints(left, right) {
  const time = new Date(right.createdAt) - new Date(left.createdAt);
  return time || String(right._id).localeCompare(String(left._id));
}

function hasValidBounds(bounds) {
  return Array.isArray(bounds)
    && bounds.length === 2
    && bounds.every((corner) => Array.isArray(corner)
      && corner.length === 2
      && corner.every(Number.isFinite));
}

function hasValidLocation(location) {
  return Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
}

export default function ClusterFootprintSheet({ selection, footprints, onClose, onSelect }) {
  const map = useMap();
  const closeRef = useRef(null);
  const previousFocusRef = useRef(document.activeElement);
  const wanted = new Set(selection.footprintIds);
  const items = (footprints || [])
    .filter((footprint) => wanted.has(footprint._id))
    .sort(compareFootprints);
  const canExpand = selection.placeCount > 1 && hasValidBounds(selection.bounds);

  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => previousFocus?.focus?.();
  }, []);

  const expandOnMap = () => {
    try {
      map.fitBounds(selection.bounds, { padding: [48, 96], maxZoom: CLUSTER_EXPANSION_ZOOM });
      map.setZoom(CLUSTER_EXPANSION_ZOOM);
    } catch {
      // Keep the current viewport if Leaflet rejects stale bounds.
    } finally {
      onClose();
    }
  };

  return createPortal(
    <div className="bliver-cluster-sheet-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="bliver-cluster-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="集合足迹"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="bliver-map-sheet__handle" aria-hidden="true" />
        <header className="bliver-map-sheet__header">
          <div>
            <h2>{selection.placeCount} 个地点</h2>
            <p>{items.length} 条足迹</p>
          </div>
          <div className="bliver-cluster-sheet__commands">
            {canExpand && (
              <button type="button" className="bliver-cluster-sheet__expand" onClick={expandOnMap}>
                <Map size={17} />
                <span>在地图中展开</span>
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭集合足迹">
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="bliver-cluster-footprint-list">
          {items.map((footprint) => {
            const author = footprint.userId || {};
            const canLocate = hasValidLocation(footprint.location);
            return (
              <div key={footprint._id} className="bliver-cluster-footprint-list__item">
                <button
                  type="button"
                  aria-label={`查看${author.name || '用户'}的足迹，${footprint.sourceLabel || '全球'}${footprint.isUnread ? '，未读更新' : ''}`}
                  onClick={() => {
                    onSelect(footprint._id);
                    onClose();
                  }}
                >
                  <span className="bliver-cluster-footprint-list__mood" aria-hidden="true">{footprint.mood || '📍'}</span>
                  <span className="bliver-cluster-footprint-list__content">
                    <strong>{author.name || '匿名用户'}</strong>
                    <span><MapPin size={13} />{footprint.placeName || '未命名地点'}</span>
                  </span>
                  <span className="bliver-cluster-footprint-list__meta">
                    <b>{footprint.sourceLabel || '全球'}</b>
                    {footprint.isUnread && <i>未读更新</i>}
                    <small><Clock3 size={12} />{new Date(footprint.createdAt).toLocaleDateString('zh-CN')}</small>
                  </span>
                </button>
                {canLocate && (
                  <button
                    type="button"
                    className="bliver-cluster-footprint-list__locate"
                    aria-label={`定位到${author.name || '用户'}在${footprint.placeName || '未命名地点'}的位置`}
                    title="定位到此位置"
                    onClick={() => {
                      map.flyTo([footprint.location.lat, footprint.location.lng], CLUSTER_EXPANSION_ZOOM, { duration: 0.7 });
                      onSelect(footprint._id);
                      onClose();
                    }}
                  >
                    <Navigation size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
