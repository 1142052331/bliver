import { useEffect, useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';

export default function MessageSettings({ value = true, onChange, disabled = false }) {
  const [checked, setChecked] = useState(value !== false);
  useEffect(() => setChecked(value !== false), [value]);
  const toggle = async () => {
    const next = !checked;
    setChecked(next);
    try { await onChange?.(next); } catch { setChecked(!next); }
  };
  return (
    <label className="bliver-message-settings">
      <span><MessageCircle aria-hidden="true" /><span><strong>允许陌生人私信</strong><small>公开足迹和资料可以收到问候</small></span></span>
      <button type="button" role="switch" aria-checked={checked} onClick={toggle} disabled={disabled} aria-label="允许陌生人私信">
        {disabled ? <Loader2 aria-hidden="true" className="is-loading" /> : <span aria-hidden="true" />}
      </button>
    </label>
  );
}
