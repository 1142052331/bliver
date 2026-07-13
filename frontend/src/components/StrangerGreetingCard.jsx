import { Check, ShieldOff, X } from 'lucide-react';

export default function StrangerGreetingCard({ request, onReply, onIgnore, onBlock, busy = false }) {
  if (!request) return null;
  return (
    <article className="bliver-greeting-card" aria-label="陌生人问候">
      <div className="bliver-greeting-card__copy">
        <strong>{request.senderName || '陌生人'} 发来问候</strong>
        <p>{request.content}</p>
      </div>
      <div className="bliver-greeting-card__actions">
        <button type="button" onClick={onReply} disabled={busy}><Check aria-hidden="true" />回复并解锁</button>
        <button type="button" onClick={onIgnore} disabled={busy}><X aria-hidden="true" />忽略</button>
        <button type="button" onClick={onBlock} disabled={busy}><ShieldOff aria-hidden="true" />屏蔽</button>
      </div>
    </article>
  );
}
