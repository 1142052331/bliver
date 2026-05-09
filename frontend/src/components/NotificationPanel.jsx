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

export default function NotificationPanel({ notifications, onClose, onMarkRead }) {
  return (
    <>
      <div className="fixed inset-0 z-[1700] pointer-events-none bg-black/30 backdrop-blur-sm" style={{opacity: 1, pointerEvents: 'auto'}} onClick={onClose} />
      <div className="absolute top-14 z-[1800] w-[360px] max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto"
        style={{ right: `max(16px, env(safe-area-inset-right))` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Notifications</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
              <Bell className="w-10 h-10" />
              <p className="text-sm text-gray-400">暂无通知</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                type="button"
                key={n._id}
                onClick={() => { console.log('[Notif] clicked', n._id, 'isRead', n.isRead); onMarkRead(n._id); }}
                className={`w-full text-left px-5 py-3 border-b border-gray-50 transition-colors
                  ${n.isRead ? 'bg-white hover:bg-gray-50' : 'bg-blue-50/60 hover:bg-blue-50'}`}
              >
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{n.senderName}</span>
                  {n.type === 'reaction' ? (
                    <> 对你的打卡表示了 <span className="text-lg">{n.content}</span></>
                  ) : n.type === 'profile_view' ? (
                    <> {n.content}</>
                  ) : (
                    <> 评论了你：<span className="text-gray-500">{n.content}</span></>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {timeAgo(n.createdAt)}
                  {!n.isRead && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500" />}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
