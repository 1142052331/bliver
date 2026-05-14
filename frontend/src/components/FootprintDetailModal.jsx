// @feature 打卡详情卡片 | Footprint Detail Modal | FootprintDetailModal
import { useState, useMemo, useEffect, useRef } from 'react';
import useUIStore from '../store/useUIStore';
import { motion } from 'framer-motion';
import { X, Trash2, Share2, Check, MapPin, Clock, Image } from 'lucide-react';
import ReactionPicker from './ReactionPicker';
import { UnreadNotice, CommentSection } from './CommentSection';
import { getReadMap, seedReadMap, markRead, getUnreadComments, isNewFootprint } from '../readStatus';
import { useFootprintActionsContext } from '../contexts/FootprintActionsContext';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function FootprintDetailModal({ fp: fpProp, userId, isAdmin, onClose, allFootprints }) {
  const { handleReact: onReact, handleDelete: onDelete, handleShare: onShare, handleComment: onComment, handleDeleteComment: onDeleteComment } = useFootprintActionsContext();
  const fp = allFootprints && fpProp ? allFootprints.find(f => f._id === fpProp._id) || fpProp : fpProp;
  if (!fp) return null;

  const mountedRef = useRef(true);
  const copyTimerRef = useRef(null);
  useEffect(() => () => { mountedRef.current = false; clearTimeout(copyTimerRef.current); }, []);

  const [copied, setCopied] = useState(false);

  // ── Auto-mark backend notifications as read on view ──
  useEffect(() => {
    if (fp._id) {
      useUIStore.getState().setViewedFootprintId(fp._id);
    }
  }, [fp._id]);

  // ── New-message section ──────────────────────────────
  const [unreadDismissed, setUnreadDismissed] = useState(false);
  useEffect(() => {
    setUnreadDismissed(false);
    seedReadMap([fp._id], [fp], userId);
  }, [fp._id, userId]);

  const { unreadComments, footprintIsNew } = useMemo(() => {
    if (unreadDismissed) return { unreadComments: [], footprintIsNew: false };
    try {
      const readMap = getReadMap(userId);
      const comments = getUnreadComments(fp, readMap);
      const isNew = isNewFootprint(fp, readMap);
      return { unreadComments: comments, footprintIsNew: isNew };
    } catch { return { unreadComments: [], footprintIsNew: false }; }
  }, [fp, unreadDismissed, userId]);

  const showUnreadSection = unreadComments.length > 0 || footprintIsNew;

  const handleDismissUnread = () => {
    markRead(fp._id, userId);
    setUnreadDismissed(true);
    useUIStore.getState().incrementMarkReadVersion();
  };
  // ──────────────────────────────────────────────────────

  const user = fp.userId || {};
  const comments = fp.comments || [];

  return (
    <div className="fixed inset-0 z-[1800] flex items-center justify-center p-4 pointer-events-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.9 }}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto z-10 pointer-events-auto
          ios-panel rounded-2xl"
      >
        {/* Photo */}
        {fp.photoUrl ? (
          <div className="relative">
            <img src={fp.photoUrl} className="w-full max-h-[50vh] object-cover rounded-t-2xl" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent rounded-t-2xl" />
          </div>
        ) : (
          <div className="w-full h-32 flex items-center justify-center bg-white/[0.02]">
            <Image className="w-10 h-10 text-white/10" />
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="ios-icon-button absolute top-3 right-3 z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5">
          {/* User & Time */}
          <div className="flex items-center gap-3 mb-3">
            <span className="cursor-pointer"
              onClick={() => useUIStore.getState().openProfile(user._id)}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400/30 hover:ring-teal-400/60 transition-all"
                  onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center
                  text-white font-bold text-sm ring-2 ring-teal-400/30 hover:ring-teal-400/60 transition-all">
                  {(user.name || '?')[0].toUpperCase()}
                </div>
              )}
            </span>
            <div>
              <span className="cursor-pointer font-semibold text-white hover:text-teal-300 transition-colors"
                onClick={() => useUIStore.getState().openProfile(user._id)}>
                {user.name || 'Unknown'}
              </span>
              <div className="flex items-center gap-1 text-xs text-white/60">
                <Clock className="w-3 h-3" />
                {new Date(fp.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Location + Mood */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-white/70">
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              {fp.placeName || 'Unknown location'}
            </p>
            {fp.mood && <span className="text-2xl leading-none">{fp.mood}</span>}
          </div>

          {/* Message */}
          <p className="text-white font-medium whitespace-pre-wrap text-[15px] leading-relaxed mb-4"
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
                  clearTimeout(copyTimerRef.current);
                  copyTimerRef.current = setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
                  bg-white/10 text-white/80 text-sm hover:bg-white/20 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Share2 className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Share'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { onClose(); onDelete(fp._id); }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
                    bg-red-400/10 text-red-400 text-sm hover:bg-red-400/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* ── New-Message Section ────────────────────────── */}
          {showUnreadSection && (
            <UnreadNotice
              footprintIsNew={footprintIsNew}
              unreadComments={unreadComments}
              onDismiss={handleDismissUnread}
            />
          )}

          {/* ── Comments Section ──────────────────────────── */}
          <CommentSection
            comments={comments}
            userId={userId}
            isAdmin={isAdmin}
            footprintId={fp._id}
            onSubmitComment={onComment}
            onDeleteComment={onDeleteComment}
            showUnreadSection={showUnreadSection}
          />
        </div>
      </motion.div>
    </div>
  );
}
