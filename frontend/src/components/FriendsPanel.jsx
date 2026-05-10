import { X, Users, MessageCircle } from 'lucide-react';

export default function FriendsPanel({
  isOpen, onClose,
  friends, onlineStatus, unreadCounts,
  onOpenProfile, onOpenChat,
}) {
  if (!isOpen) return null;

  const onlineFirst = [...friends].sort((a, b) => {
    const aOn = onlineStatus[a._id] ? 1 : 0;
    const bOn = onlineStatus[b._id] ? 1 : 0;
    return bOn - aOn;
  });

  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center md:justify-end pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 pointer-events-auto w-full h-full md:w-[360px] md:h-full md:mr-0
        bg-[#0f0f14]/90 backdrop-blur-2xl
        border-l border-white/[0.06]
        shadow-[0_0_60px_rgba(0,0,0,0.5)]
        flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0
          border-b border-white/[0.06]"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-400/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-white/90 font-semibold text-sm"
              style={{ fontFamily: 'var(--font-body)' }}>
              我的好友
            </span>
            <span className="text-white/20 text-xs ml-1">{friends.length}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center
              hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 aurora-scroll"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {onlineFirst.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/20">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>暂无好友</p>
              <p className="text-xs mt-1 text-white/10" style={{ fontFamily: 'var(--font-body)' }}>
                去他人的主页添加好友吧
              </p>
            </div>
          ) : (
            onlineFirst.map((f) => {
              const isOnline = onlineStatus[f._id] || false;
              const unread = unreadCounts[f._id] || 0;
              const isAsen = f.name === '阿森';

              return (
                <button
                  key={f._id}
                  onClick={() => onOpenProfile(f._id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                    hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors group"
                >
                  {/* Avatar + online dot */}
                  <div className="relative flex-shrink-0">
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                        onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center
                        text-white text-sm font-bold ring-1 ring-white/10
                        ${isAsen ? 'bg-amber-500/60' : 'bg-white/10'}`}>
                        {(f.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {/* Online indicator */}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0f0f14]
                      ${isOnline
                        ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)] animate-pulse'
                        : 'bg-white/15'}`}
                    />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-white/80 truncate"
                        style={{ fontFamily: 'var(--font-body)' }}>
                        {f.name}
                      </span>
                      {isAsen && (
                        <span className="text-[10px] text-amber-400/70 font-medium flex-shrink-0"
                          style={{ fontFamily: 'var(--font-body)' }}>
                          官方
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-white/30"
                      style={{ fontFamily: 'var(--font-body)' }}>
                      {isOnline ? '在线' : '离线'}
                    </span>
                  </div>

                  {/* Chat button + unread badge */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {unread > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center
                        bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    <span
                      onClick={(e) => { e.stopPropagation(); onOpenChat(f._id); }}
                      className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-cyan-600/20
                        text-white/40 hover:text-cyan-400
                        border border-white/[0.04] hover:border-cyan-500/30
                        transition-all duration-200 opacity-0 group-hover:opacity-100"
                      title="发消息"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
