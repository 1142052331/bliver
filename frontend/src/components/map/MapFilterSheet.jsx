import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const GROUPS = [
  {
    legend: '关系',
    key: 'relationship',
    options: [['all', '全部'], ['self', '自己'], ['friends', '好友'], ['public', '公开']],
  },
  {
    legend: '时间',
    key: 'period',
    options: [['24h', '24小时'], ['7d', '7天'], ['year', '今年']],
  },
  {
    legend: '内容',
    key: 'content',
    options: [['all', '全部内容'], ['photo', '有照片'], ['unread', '未读']],
  },
];

export default function MapFilterSheet({ open, query, isAuthenticated, onApply, onClose }) {
  const [draft, setDraft] = useState(query);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(query);
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [open, query]);

  if (!open) return null;

  const reset = () => {
    onApply({ ...query, relationship: 'all', period: '7d', content: 'all' });
    onClose();
  };

  return createPortal(
    <div className="bliver-map-sheet-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="bliver-map-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="筛选足迹"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="bliver-map-sheet__handle" aria-hidden="true" />
        <header className="bliver-map-sheet__header">
          <h2>筛选</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭筛选">
            <X size={20} />
          </button>
        </header>

        <div className="bliver-map-filter-groups">
          {GROUPS.map((group) => (
            <fieldset key={group.key} className="bliver-map-filter-group">
              <legend>{group.legend}</legend>
              <div className="bliver-map-filter-group__options">
                {group.options.map(([value, label]) => {
                  const disabled = group.key === 'content' && value === 'unread' && !isAuthenticated;
                  return (
                    <button
                      key={value}
                      type="button"
                      className="bliver-map-choice"
                      aria-pressed={draft[group.key] === value}
                      disabled={disabled}
                      onClick={() => setDraft((current) => ({ ...current, [group.key]: value }))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {group.key === 'content' && !isAuthenticated && (
                <p className="bliver-map-filter-group__hint">登录后可筛选未读</p>
              )}
            </fieldset>
          ))}
        </div>

        <footer className="bliver-map-sheet__actions">
          <button type="button" className="bliver-map-sheet__secondary" onClick={reset}>重置筛选</button>
          <button
            type="button"
            className="bliver-map-sheet__primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            应用筛选
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
