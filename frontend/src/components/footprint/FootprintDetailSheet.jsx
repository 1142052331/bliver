import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

export default function FootprintDetailSheet({ children, onClose, title = '足迹详情' }) {
  const [snap, setSnap] = useState('default');
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="bliver-detail-layer">
      <button type="button" className="bliver-detail-scrim" aria-label="关闭详情" onClick={onClose} />
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-snap={snap}
        className="bliver-detail-sheet"
      >
        <div className="bliver-detail-sheet__handle" aria-hidden="true" />
        <header className="bliver-detail-sheet__header">
          <span className="bliver-detail-sheet__title">{title}</span>
          <div className="bliver-detail-sheet__header-actions">
            <button
              type="button"
              className="bliver-icon-button"
              aria-label={snap === 'default' ? '展开详情' : '收起详情'}
              onClick={() => setSnap((value) => value === 'default' ? 'expanded' : 'default')}
            >
              {snap === 'default' ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </button>
            <button type="button" className="bliver-icon-button" aria-label="关闭详情" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="bliver-detail-sheet__scroll">{children}</div>
      </section>
    </div>
  );
}
