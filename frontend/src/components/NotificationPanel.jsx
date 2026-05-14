import { X, Bell } from 'lucide-react';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function NotificationPanel({ notifications, onClose, onNavigate }) {
  return (
    <>
      <div className="ios-backdrop fixed inset-0 z-[1700] pointer-events-none" style={{opacity: 1, pointerEvents: 'auto'}} onClick={onClose} />
      <div className="ios-panel fixed top-14 z-[1800] w-[370px] max-w-[92vw] max-h-[calc(100dvh-76px)] overflow-hidden pointer-events-auto flex flex-col"
        style={{ right: `max(16px, env(safe-area-inset-right))` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h3 className="font-extrabold text-white/92">Notifications</h3>
          <button onClick={onClose} className="ios-icon-button w-8 h-8 min-w-8">
            <X className="w-4 h-4 text-white/55" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto aurora-scroll p-2">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-white/28">
              <Bell className="w-10 h-10" />
              <p className="text-sm text-white/36">暂无通知</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                type="button"
                key={n._id}
                onClick={() => onNavigate(n)}
                className={`w-full text-left px-4 py-3 rounded-[18px] mb-1 transition-colors border
                  ${n.isRead ? 'bg-white/[0.045] border-white/[0.06] hover:bg-white/[0.075]' : 'bg-sky-400/12 border-sky-300/20 hover:bg-sky-400/16'}`}
              >
                <p className="text-sm text-white/82">
                  <span className="font-medium">{n.senderName}</span>
                  {n.type === 'reaction' ? (
                    <> 对你的打卡表示了 <span className="text-lg">{n.content}</span></>
                  ) : n.type === 'profile_view' ? (
                    <> {n.content}</>
                  ) : (
                    <> 评论了你：<span className="text-white/48">{n.content}</span></>
                  )}
                </p>
                <p className="text-xs text-white/36 mt-1">
                  {timeAgo(n.createdAt)}
                  {!n.isRead && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500" />}
                </p>
              </button>
            ))
          )}
        </div>

        {/* 底部渐变收口 */}
        <div className="flex-shrink-0 h-8 pointer-events-none rounded-b-[24px]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(16,19,26,0.94) 100%)' }} />
      </div>
    </>
  );
}
