import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Globe2, Map, Navigation, X } from 'lucide-react';
import LocationPermissionNotice from '../LocationPermissionNotice';

const LABELS = { smart: '智能', region: '本省', country: '本国', global: '全球' };

export default function MapScopeControl({
  open,
  value,
  context,
  onOpen,
  onChange,
  onClose,
  onRequestLocation,
  viewerKey = 'guest',
}) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => closeRef.current?.focus());
  }, [open]);

  const choose = (scope) => {
    if (scope === 'region' && !context.regionCode) {
      onRequestLocation({ explicit: true });
      return;
    }
    if (scope === 'country' && !context.countryCode) {
      onRequestLocation({ explicit: true });
      return;
    }
    const next = { scope };
    if (scope === 'smart' || scope === 'region' || scope === 'country') {
      if (context.countryCode) next.countryCode = context.countryCode;
    }
    if (scope === 'smart' || scope === 'region') {
      if (context.regionCode) next.regionCode = context.regionCode;
    }
    onChange(next);
    onClose();
  };

  const options = [
    ['smart', '智能', context.regionName || context.countryName || '自动选择', Navigation],
    ['region', '本省', context.regionName || '需要定位', Map],
    ['country', '本国', context.countryName || '需要定位', Map],
    ['global', '全球', '公开发现', Globe2],
  ];

  return (
    <>
      <button
        type="button"
        className="bliver-map-toolbar__control"
        onClick={onOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Globe2 size={17} />
        <span>{LABELS[value] || LABELS.smart}</span>
        <ChevronDown size={15} />
      </button>
      {open && createPortal(
        <div className="bliver-map-sheet-layer" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}>
          <section
            className="bliver-map-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="选择地图范围"
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
          >
            <div className="bliver-map-sheet__handle" aria-hidden="true" />
            <header className="bliver-map-sheet__header">
              <h2>地图范围</h2>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭地图范围">
                <X size={20} />
              </button>
            </header>
            <LocationPermissionNotice
              permissionState={context.reason === 'permission-denied'
                ? 'denied'
                : context.reason === 'location-unavailable'
                  ? 'unavailable'
                  : context.reason === 'location-error' ? 'error' : 'idle'}
              viewerKey={viewerKey}
              onRequestLocation={onRequestLocation}
            />
            <div className="bliver-map-scope-options">
              {options.map(([scope, label, detail, Icon]) => {
                const unavailable = (scope === 'region' && !context.regionCode)
                  || (scope === 'country' && !context.countryCode);
                return (
                  <button
                    key={scope}
                    type="button"
                    className="bliver-map-scope-option"
                    aria-pressed={value === scope}
                    aria-disabled={unavailable}
                    onClick={() => choose(scope)}
                  >
                    <Icon size={19} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
