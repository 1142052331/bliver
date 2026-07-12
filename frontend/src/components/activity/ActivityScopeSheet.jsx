import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const OPTIONS = [
  { key: 'smart', label: '智能范围' },
  { key: 'region', label: '本省' },
  { key: 'country', label: '本国' },
  { key: 'global', label: '全球' },
];

export default function ActivityScopeSheet({ open, value, onChange, onClose, regionName, countryName }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="bliver-activity-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="bliver-activity-sheet" role="dialog" aria-modal="true" aria-labelledby="activity-scope-title" tabIndex={-1} ref={ref}>
        <div className="bliver-activity-sheet__handle" aria-hidden="true" />
        <header className="bliver-activity-sheet__header">
          <h2 id="activity-scope-title">选择动态范围</h2>
          <button type="button" aria-label="关闭范围选择" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="bliver-activity-sheet__options">
          {OPTIONS.map((option) => {
            const detail = option.key === 'region' ? regionName : option.key === 'country' ? countryName : '';
            return (
              <button type="button" key={option.key} aria-pressed={value === option.key} onClick={() => { onChange(option.key); onClose(); }}>
                <span>{option.label}</span>{detail && <small>{detail}</small>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
