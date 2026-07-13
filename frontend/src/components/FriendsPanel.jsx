// @feature 好友面板 | Friends Panel | FriendsPanel
import { motion } from 'framer-motion';
import { X, Users, MessageCircle } from 'lucide-react';
import { isSuperuser } from '../domain/superuser';
import useConversations from '../hooks/useConversations';
import StrangerGreetingCard from './StrangerGreetingCard';

export default function FriendsPanel({
  isOpen, onClose,
  friends, onlineStatus, unreadCounts,
  onOpenProfile, onOpenChat,
  reserveMobileNavigation = false,
}) {
  const { conversations, reply, ignore, block } = useConversations({ enabled: isOpen });
  if (!isOpen) return null;

  const greetingRequests = conversations.filter((item) => item.state === 'greeting_pending');

  const onlineFirst = [...friends].sort((a, b) => {
    const aOn = onlineStatus[a._id] ? 1 : 0;
    const bOn = onlineStatus[b._id] ? 1 : 0;
    return bOn - aOn;
  });

  return (
    <div className="fixed inset-0 z-[1700] pointer-events-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="ios-backdrop absolute inset-0 pointer-events-auto"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
        className={`ios-panel absolute top-0 right-0 h-full w-full md:w-[390px]
          flex flex-col pointer-events-auto ${reserveMobileNavigation ? 'bliver-destination-surface' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0
          border-b border-white/10"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-sky-300" />
            </div>
            <span className="text-white/90 font-semibold text-sm"
              style={{ fontFamily: 'var(--font-body)' }}>
              我的好友
            </span>
            <span className="text-white/20 text-xs ml-1">{friends.length}</span>
          </div>
          <button
            onClick={onClose}
            className="ios-icon-button w-8 h-8 min-w-8"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 aurora-scroll"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {greetingRequests.length > 0 && (
            <section className="bliver-message-requests" aria-label="陌生人问候">
              <h2>陌生人问候</h2>
              {greetingRequests.map((request) => (
                <StrangerGreetingCard
                  key={request._id}
                  request={{ ...request, senderName: request.otherUser?.name, content: request.lastMessagePreview }}
                  busy={reply.isPending || ignore.isPending || block.isPending}
                  onReply={() => onOpenChat(request.otherUser?._id, request)}
                  onIgnore={() => ignore.mutate(request._id)}
                  onBlock={() => block.mutate(request.otherUser?._id)}
                />
              ))}
            </section>
          )}
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
              const isAsen = isSuperuser(f);

              return (
                <button
                  key={f._id}
                  onClick={() => onOpenProfile(f._id)}
                  className="ios-list-row w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px]
                    transition-colors group"
                >
                  {/* Avatar + online dot */}
                  <div className="relative flex-shrink-0">
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-white/18"
                        onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center
                        text-white text-sm font-bold ring-1 ring-white/10
                        ${isAsen ? 'bg-amber-500/70' : 'bg-white/12'}`}>
                        {(f.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black/40
                      ${isOnline
                        ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)] animate-pulse'
                        : 'bg-white/15'}`}
                    />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-white/86 truncate"
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
                      className="p-1.5 rounded-full bg-white/[0.08] hover:bg-sky-400/16
                        text-white/48 hover:text-sky-300
                        border border-white/[0.08] hover:border-sky-300/25
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

        {/* 底部渐变收口 */}
        <div className="flex-shrink-0 h-8 pointer-events-none rounded-b-[24px]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(16,19,26,0.94) 100%)' }} />
      </motion.div>
    </div>
  );
}
