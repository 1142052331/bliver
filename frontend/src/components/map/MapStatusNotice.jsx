import { AlertCircle, LoaderCircle, MapOff, RefreshCcw, WifiOff } from 'lucide-react';

const ICONS = {
  tile: MapOff,
  data: AlertCircle,
  refresh: LoaderCircle,
  empty: MapOff,
  offline: WifiOff,
  location: AlertCircle,
};

export default function MapStatusNotice({ kind, message, detail, actionLabel, onAction }) {
  const Icon = ICONS[kind] || AlertCircle;
  const isAlert = kind === 'tile' || kind === 'data';
  return (
    <div className={`bliver-map-notice bliver-map-notice--${kind}`} role={isAlert ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span><strong>{message}</strong>{detail && <small>{detail}</small>}</span>
      {actionLabel && (
        <button type="button" onClick={onAction}>
          <RefreshCcw size={15} aria-hidden="true" />{actionLabel}
        </button>
      )}
    </div>
  );
}
