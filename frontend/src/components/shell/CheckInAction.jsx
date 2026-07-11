import { MapPinPlus } from 'lucide-react';

export default function CheckInAction({ disabled = false, onPress }) {
  return (
    <button
      type="button"
      className="bliver-check-in-action"
      aria-label="发布足迹"
      aria-disabled={disabled}
      data-shell-control
      disabled={disabled}
      onClick={onPress}
    >
      <MapPinPlus size={22} strokeWidth={2.25} aria-hidden="true" />
      <span>发布足迹</span>
    </button>
  );
}
