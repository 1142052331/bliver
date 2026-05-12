import { useState } from 'react';
import { Trash2, Send, MessageCircle, Bell } from 'lucide-react';

function maskIp(ip) {
  if (!ip) return 'Unknown';
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return 'localhost';
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  const parts = ip.split(':').filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join(':') + ':x:x';
  return ip;
}

export function UnreadNotice({ footprintIsNew, unreadComments, onDismiss }) {
  if (!footprintIsNew && unreadComments.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-cyan-400/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 font-semibold text-sm text-cyan-400"
          style={{ fontFamily: 'var(--font-body)' }}>
          <Bell className="w-4 h-4" />
          {footprintIsNew && unreadComments.length > 0
            ? '新打卡 · 有新留言'
            : footprintIsNew
              ? '新打卡'
              : '新消息 · 你还没看过'}
        </h3>
        <button onClick={onDismiss}
          className="text-xs px-3 py-1 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/25 hover:bg-cyan-400/20 transition-colors"
          style={{ fontFamily: 'var(--font-body)' }}>
          已读
        </button>
      </div>
      {footprintIsNew && unreadComments.length === 0 && (
        <p className="text-xs text-cyan-400/60 mb-3" style={{ fontFamily: 'var(--font-body)' }}>
          这条足迹你还没看过
        </p>
      )}
      {unreadComments.length > 0 && (
        <div className="space-y-2 mb-3">
          {unreadComments.map((c, i) => (
            <div key={c._id || 'unread-' + i}
              className="relative p-3 rounded-xl"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
              <p className="text-sm pr-6">
                <span className="font-semibold text-cyan-300">{c.username}</span>
                <span className="text-white/15 mx-1.5">·</span>
                <span className="text-white/80">{c.content}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1.5">
                {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentSection({ comments, userId, isAdmin, footprintId, onSubmitComment, onDeleteComment, showUnreadSection }) {
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleSubmit = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      await onSubmitComment(footprintId, commentText.trim());
      setCommentText('');
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  return (
    <div className={showUnreadSection ? 'pt-4 border-t border-white/[0.06]' : 'mt-4 pt-4 border-t border-white/[0.06]'}>
      <h3 className="flex items-center gap-1.5 font-semibold text-sm text-white/80 mb-3"
        style={{ fontFamily: 'var(--font-body)' }}>
        <MessageCircle className="w-4 h-4 text-teal-400" />
        留言 ({comments.length})
      </h3>

      {comments.length > 0 ? (
        <div className="space-y-2 mb-3">
          {comments.map((c, i) => {
            const canDelete = isAdmin || (c.userId && c.userId === userId);
            return (
              <div key={c._id || c.createdAt + '-' + i}
                className="relative p-3 rounded-xl transition-all group"
                style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.06)' }}>
                <p className="text-sm pr-6">
                  <span className="font-semibold text-teal-300">{c.username}</span>
                  <span className="text-white/20 mx-1.5">·</span>
                  <span className="text-white/80">{c.content}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1.5">
                  {maskIp(c.ipAddress)}
                  <span className="mx-1.5">·</span>
                  {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {canDelete && (
                  <button type="button" disabled={deletingId === c._id}
                    onClick={async () => {
                      if (!c._id || !onDeleteComment) return;
                      setDeletingId(c._id);
                      await onDeleteComment(footprintId, c._id);
                      setDeletingId(null);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md text-white/15 hover:text-red-400/80 opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:opacity-30"
                    title="删除评论">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-3">还没有回复，来说点什么吧</p>
      )}

      <div className="flex gap-2">
        <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
          placeholder="写留言..." rows={2}
          className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-xl
            text-white placeholder:text-gray-500 resize-none
            focus:ring-2 focus:ring-teal-500/30 focus:border-transparent outline-none" />
        <button onClick={handleSubmit} disabled={sending || !commentText.trim()}
          className="flex-shrink-0 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-medium
            disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
