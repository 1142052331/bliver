import { isSuperuserName } from '../domain/superuser';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Single chat message bubble, with variant styling for:
 * - Own messages (mine vs theirs)
 * - Superuser styling (asen glow)
 * - Pending/confirmed/delivered status
 */
export default function MessageBubble({ msg, userId, friendName, chatUserId }) {
  const isMine = msg.senderId === userId;
  const isFromAsen = !isMine && isSuperuserName(friendName) && msg.senderId === chatUserId;
  const isPending = msg.pending;
  const isAsenSenderBubble = isMine && userId && isSuperuserName(friendName);

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
        transition-opacity duration-200
        ${isPending ? 'opacity-60' : 'opacity-100'}
        ${isMine
          ? (isAsenSenderBubble
              ? 'bg-amber-500/20 border border-amber-400/30 text-amber-50 rounded-br-md animate-pulse'
              : 'bg-cyan-600/30 border border-cyan-500/30 text-cyan-50 rounded-br-md')
          : (isFromAsen
              ? 'bg-amber-500/10 border border-amber-400/20 text-amber-50 rounded-bl-md shadow-[0_0_12px_rgba(251,191,36,0.08)]'
              : 'bg-white/[0.06] border border-white/[0.06] text-white/85 rounded-bl-md')
        }`}
        style={{ fontFamily: 'var(--font-body)', wordBreak: 'break-word' }}
      >
        <p>{msg.content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          {isMine && (
            <span className="text-[10px] text-white/20">
              {msg._confirmed ? '✓' : isPending ? '⏳' : ''}
            </span>
          )}
          <span className="text-[10px] text-white/15">{timeStr(msg.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
