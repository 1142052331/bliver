import { useMemo, useState } from 'react';
import { X, Trash2, Share2, Check, MapPin, Clock, Image, MessageCircle, Send } from 'lucide-react';
import ReactionPicker from './ReactionPicker';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function maskIp(ip) {
  if (!ip) return 'Unknown';
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return 'localhost';
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  const parts = ip.split(':').filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join(':') + ':x:x';
  return ip;
}

function FootprintDetailModal({ fp, userId, isAdmin, onReact, onDelete, onShare, onComment, onClose }) {
  if (!fp) return null;

  const [copied, setCopied] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const user = fp.userId || {};
  const comments = fp.comments || [];

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      await onComment(fp._id, commentText.trim());
      setCommentText('');
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[1800] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl z-10">
        {/* Photo */}
        {fp.photoUrl ? (
          <img src={fp.photoUrl} className="w-full max-h-[50vh] object-cover rounded-t-2xl" />
        ) : (
          <div className="w-full h-40 bg-gray-100 rounded-t-2xl flex items-center justify-center">
            <Image className="w-10 h-10 text-gray-300" />
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 bg-black/30 hover:bg-black/50 rounded-full text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-5">
          {/* User & Time */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className="cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} className="w-10 h-10 rounded-full object-cover hover:ring-2 hover:ring-blue-300 transition-all" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm hover:ring-2 hover:ring-blue-300 transition-all">
                  {(user.name || '?')[0].toUpperCase()}
                </div>
              )}
            </span>
            <div>
              <span
                className="cursor-pointer font-semibold text-gray-800 hover:text-blue-600"
                onClick={() => window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
              >
                {user.name || 'Unknown'}
              </span>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                {new Date(fp.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Location + Mood */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-gray-500">
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              {fp.placeName || 'Unknown location'}
            </p>
            {fp.mood && (
              <span className="text-2xl leading-none animate-bounce-in" title="Mood">{fp.mood}</span>
            )}
          </div>

          {/* Message */}
          <p className="text-gray-700 whitespace-pre-wrap text-[15px] leading-relaxed mb-4">
            {fp.message}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <ReactionPicker fp={fp} userId={userId} onReact={onReact} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onShare(fp._id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-sm hover:bg-gray-200 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Copied' : 'Share'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { onClose(); onDelete(fp._id); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* ── Comments Section ──────────────────────────── */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="flex items-center gap-1.5 font-semibold text-sm text-gray-800 mb-3">
              <MessageCircle className="w-4 h-4" />
              Comments ({comments.length})
            </h3>

            {/* Comment List */}
            {comments.length > 0 ? (
              <div className="space-y-2 mb-3">
                {comments.map((c, i) => (
                  <div key={i} className="p-2.5 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{c.username}</span>
                      <span className="text-gray-400 mx-1">:</span>
                      <span className="text-gray-600">{c.content}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      来自 IP: {maskIp(c.ipAddress)}
                      <span className="mx-1">·</span>
                      {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">还没有回复，来说点什么吧</p>
            )}

            {/* Comment Form */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={sending || !commentText.trim()}
                  className="flex-shrink-0 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium
                    hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                    flex items-center gap-1"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClusterDetailPanel({ footprints, userId, isAdmin, onReact, onDelete, onShare, onComment, onClose }) {
  const [detailFpId, setDetailFpId] = useState(null);
  const detailFp = detailFpId ? footprints.find(f => f._id === detailFpId) : null;

  const grouped = useMemo(() => {
    const map = {};
    footprints.forEach((fp) => {
      const uid = fp.userId?._id || fp.userId || 'unknown';
      if (!map[uid]) map[uid] = { user: fp.userId || null, items: [] };
      map[uid].items.push(fp);
    });
    Object.values(map).forEach((g) => g.items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    return Object.values(map);
  }, [footprints]);

  const placeName = footprints[0]?.placeName || 'this location';
  const count = footprints.length;

  if (footprints.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[1500] bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Bottom Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[1600] bg-white rounded-t-2xl shadow-2xl
          max-h-[70vh] flex flex-col animate-slide-up"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg text-gray-800">
              {count} footprint{count > 1 ? 's' : ''}
            </h2>
            <p className="text-sm text-gray-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {placeName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-6">
          {grouped.map(({ user, items }) => (
            <div key={user?._id || 'unknown'}>
              {/* User Header */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="cursor-pointer"
                  onClick={() => user?._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
                >
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-100 hover:ring-blue-300 transition-all" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-blue-300 transition-all">
                      {(user?.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </span>
                <span
                  className="cursor-pointer font-semibold text-sm text-gray-800 hover:text-blue-600"
                  onClick={() => user?._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
                >
                  {user?.name || 'Unknown'}
                </span>
                <span className="text-xs text-gray-400">{items.length} post{items.length > 1 ? 's' : ''}</span>
              </div>

              {/* Post Cards */}
              <div className="space-y-2">
                {items.map((fp) => {
                  const reactionCount = (fp.reactions || []).length;
                  const commentCount = fp.comments?.length || 0;

                  return (
                    <div
                      key={fp._id}
                      onClick={() => setDetailFpId(fp._id)}
                      className="flex gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      {/* Thumbnail — only show when photo exists */}
                      {fp.photoUrl && (
                        <img
                          src={fp.photoUrl}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs text-gray-400">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            {timeStr(fp.createdAt)}
                          </span>
                          {fp.mood && (
                            <span className="text-base leading-none">{fp.mood}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap leading-relaxed">
                          {fp.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {reactionCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              {[...new Set((fp.reactions || []).map(r => r.emoji))].slice(0, 3).join('')}
                              {reactionCount > 1 && <span>{reactionCount}</span>}
                            </span>
                          )}
                          {commentCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <MessageCircle className="w-3 h-3" />
                              {commentCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {detailFp && (
        <FootprintDetailModal
          fp={detailFp}
          userId={userId}
          isAdmin={isAdmin}
          onReact={onReact}
          onDelete={onDelete}
          onShare={onShare}
          onComment={onComment}
          onClose={() => setDetailFpId(null)}
        />
      )}

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
