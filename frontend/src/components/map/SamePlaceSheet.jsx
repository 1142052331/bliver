import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, MapPin, X } from 'lucide-react';

function compareFootprints(left, right) {
  const time = new Date(right.createdAt) - new Date(left.createdAt);
  return time || String(right._id).localeCompare(String(left._id));
}

export default function SamePlaceSheet({ ids, footprints, onClose, onSelect }) {
  const closeRef = useRef(null);
  const previousFocusRef = useRef(document.activeElement);
  const items = useMemo(() => {
    const wanted = new Set(ids || []);
    return (footprints || []).filter((footprint) => wanted.has(footprint._id)).sort(compareFootprints);
  }, [footprints, ids]);

  useEffect(() => {
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => previousFocusRef.current?.focus?.();
  }, []);

  return createPortal(
    <div className="bliver-same-place-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="bliver-same-place-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="同地点足迹"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="bliver-map-sheet__handle" aria-hidden="true" />
        <header className="bliver-map-sheet__header">
          <div>
            <h2>同一地点</h2>
            <p>{items.length} 条足迹</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭同地点足迹">
            <X size={20} />
          </button>
        </header>
        <div className="bliver-same-place-list">
          {items.map((footprint) => {
            const author = footprint.userId || {};
            return (
              <button
                key={footprint._id}
                type="button"
                aria-label={`查看${author.name || '用户'}的足迹，${footprint.sourceLabel || '全球'}${footprint.isUnread ? '，未读更新' : ''}`}
                onClick={() => {
                  onSelect(footprint._id);
                  onClose();
                }}
              >
                <span className="bliver-same-place-list__mood" aria-hidden="true">{footprint.mood || '📍'}</span>
                <span className="bliver-same-place-list__content">
                  <strong>{author.name || '匿名用户'}</strong>
                  <span><MapPin size={13} />{footprint.placeName || '未命名地点'}</span>
                </span>
                <span className="bliver-same-place-list__meta">
                  <b>{footprint.sourceLabel || '全球'}</b>
                  {footprint.isUnread && <i>未读更新</i>}
                  <small><Clock3 size={12} />{new Date(footprint.createdAt).toLocaleDateString('zh-CN')}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
