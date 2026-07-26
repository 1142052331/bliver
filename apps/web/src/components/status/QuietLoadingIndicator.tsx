import './quiet-loading-indicator.css';

export interface QuietLoadingIndicatorProps {
  readonly label: string;
}

export function QuietLoadingIndicator({ label }: QuietLoadingIndicatorProps) {
  return (
    <span className="quiet-loading-indicator">
      <span aria-hidden="true" className="quiet-loading-indicator__track">
        <span className="quiet-loading-indicator__bar" />
      </span>
      <span className="quiet-loading-indicator__label">{label}</span>
    </span>
  );
}
