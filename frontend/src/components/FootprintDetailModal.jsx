import { useState } from 'react';
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

export default function FootprintDetailModal({ fp, userId, isAdmin, onReact, onDelete, onShare, onComment, onClose }) {
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto aurora-scroll z-10
        aurora-glass rounded-2xl shadow-2xl"
        style={{ background: 'var(--aurora-surface)' }}>

        {/* Photo */}
        {fp.photoUrl ? (
          <div className="relative">
            <img src={fp.photoUrl} className="w-full max-h-[50vh] object-cover rounded-t-2xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f28] via-transparent to-transparent rounded-t-2xl" />
          </div>
        ) : (
          <div className="w-full h-40 flex items-center justify-center"
            style={{ background: 'var(--aurora-surface-glow)' }}>
            <Image className="w-10 h-10 text-white/10" />
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 bg-black/40 hover:bg-black/60
            backdrop-blur rounded-full text-white/80 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-5">
          {/* User & Time */}
          <div className="flex items-center gap-3 mb-3">
            <span className="cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400/30 hover:ring-teal-400/60 transition-all" />
              ) : (
                <div className="w-10 h-10 rounded-full aurora-btn flex items-center justify-center
                  text-white font-bold text-sm ring-2 ring-teal-400/30 hover:ring-teal-400/60 transition-all">
                  {(user.name || '?')[0].toUpperCase()}
                </div>
              )}
            </span>
            <div>
              <span className="cursor-pointer font-semibold text-white/90 hover:text-teal-300 transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}>
                {user.name || 'Unknown'}
              </span>
              <div className="flex items-center gap-1 text-xs text-white/30">
                <Clock className="w-3 h-3" />
                {new Date(fp.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Location + Mood */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-white/50">
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              {fp.placeName || 'Unknown location'}
            </p>
            {fp.mood && <span className="text-2xl leading-none">{fp.mood}</span>}
          </div>

          {/* Message */}
          <p className="text-white/80 whitespace-pre-wrap text-[15px] leading-relaxed mb-4"
            style={{ fontFamily: 'var(--font-body)' }}>
            {fp.message}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <ReactionPicker fp={fp} userId={userId} onReact={onReact} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onShare(fp._id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg
                  bg-white/[0.04] text-white/50 text-sm hover:bg-white/[0.08] hover:text-white/70 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Copied' : 'Share'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { onClose(); onDelete(fp._id); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg
                    bg-red-400/10 text-red-400 text-sm hover:bg-red-400/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* ── Comments Section ──────────────────────────── */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <h3 className="flex items-center gap-1.5 font-semibold text-sm text-white/60 mb-3"
              style={{ fontFamily: 'var(--font-body)' }}>
              <MessageCircle className="w-4 h-4 text-teal-400" />
              留言 ({comments.length})
            </h3>

            {comments.length > 0 ? (
              <div className="space-y-2 mb-3">
                {comments.map((c, i) => (
                  <div key={i}
                    className="p-3 rounded-xl transition-all"
                    style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.06)' }}>
                    <p className="text-sm">
                      <span className="font-semibold text-teal-300">{c.username}</span>
                      <span className="text-white/20 mx-1.5">·</span>
                      <span className="text-white/70">{c.content}</span>
                    </p>
                    <p className="text-xs text-white/20 mt-1.5">
                      {maskIp(c.ipAddress)}
                      <span className="mx-1.5">·</span>
                      {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/20 mb-3">还没有回复，来说点什么吧</p>
            )}

            {/* Comment Form */}
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="写留言..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm aurora-input rounded-xl resize-none"
              />
              <button
                onClick={handleSubmitComment}
                disabled={sending || !commentText.trim()}
                className="flex-shrink-0 px-4 py-2 aurora-btn text-white rounded-xl text-sm font-medium
                  disabled:opacity-30 disabled:cursor-not-allowed transition-all
                  flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
