import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const OPTIONS = [
  { key: 'smart', label: '智能范围' },
  { key: 'region', label: '本省' },
  { key: 'country', label: '本国' },
  { key: 'global', label: '全球' },
];

export default function ActivityScopeSheet({
  open,
  value,
  onChange,
  onClose,
  regionName,
  countryName,
  regionAvailable = false,
  countryAvailable = false,
}) {
  const ref = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => previousFocusRef.current?.focus?.();
  }, [open]);
  if (!open) return null;
  return (
    <div className="bliver-activity-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="bliver-activity-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-scope-title"
        aria-describedby={regionAvailable && countryAvailable ? undefined : 'activity-scope-location-help'}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = Array.from(ref.current?.querySelectorAll('button:not(:disabled)') || []);
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="bliver-activity-sheet__handle" aria-hidden="true" />
        <header className="bliver-activity-sheet__header">
          <h2 id="activity-scope-title">选择动态范围</h2>
          <button ref={closeRef} type="button" aria-label="关闭范围选择" onClick={onClose}><X size={20} /></button>
        </header>
        {(!regionAvailable || !countryAvailable) && (
          <p id="activity-scope-location-help" className="bliver-activity-sheet__help">
            开启定位后可选择本省和本国动态。
          </p>
        )}
        <div className="bliver-activity-sheet__options">
          {OPTIONS.map((option) => {
            const unavailable = (option.key === 'region' && !regionAvailable)
              || (option.key === 'country' && !countryAvailable);
            const detail = unavailable
              ? '需要定位'
              : option.key === 'region' ? regionName : option.key === 'country' ? countryName : '';
            return (
              <button type="button" key={option.key} disabled={unavailable} aria-pressed={value === option.key} onClick={() => { onChange(option.key); onClose(); }}>
                <span>{option.label}</span>{detail && <small>{detail}</small>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
