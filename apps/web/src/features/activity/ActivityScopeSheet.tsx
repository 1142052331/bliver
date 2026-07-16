import { Button } from '@bliver/ui';
import type { ActivityQuery } from '@bliver/contracts';
import { useEffect, useRef, type KeyboardEvent } from 'react';

export function ActivityScopeSheet({ value, onChange, onClose }: { readonly value: ActivityQuery; readonly onChange: (value: ActivityQuery) => void; readonly onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button,select,[tabindex]:not([tabindex="-1"])') ?? [])];
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div ref={panel} className="activity-scope" role="dialog" aria-modal="true" aria-label="Activity filters" onKeyDown={onKeyDown}><div className="activity-scope__bar"><strong>Filter moments</strong><Button ref={close} variant="ghost" aria-label="Close filters" onClick={onClose}>Close</Button></div><label>Area<select aria-label="Activity scope" value={value.scope} onChange={(event) => onChange({ ...value, scope: event.target.value as ActivityQuery['scope'] })}><option value="smart">Nearby first</option><option value="region">Region</option><option value="country">Country</option><option value="global">Worldwide</option></select></label><label>People<select aria-label="Activity relationship" value={value.relationship} onChange={(event) => onChange({ ...value, relationship: event.target.value as ActivityQuery['relationship'] })}><option value="all">Everyone I can see</option><option value="friends">Friends</option><option value="public">Public moments</option></select></label><label>Content<select aria-label="Activity content" value={value.content} onChange={(event) => onChange({ ...value, content: event.target.value as ActivityQuery['content'] })}><option value="all">All moments</option><option value="unread">Unread</option><option value="media">Photos</option></select></label></div>;
}
