import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Megaphone, Send, Loader2 } from 'lucide-react';
import { apiClient } from '../api';

const READ_KEY = 'bliver_announce_read_last';

function getLastRead() {
  try { return parseInt(localStorage.getItem(READ_KEY), 10) || 0; } catch { return 0; }
}

function setLastRead(ts) {
  try { localStorage.setItem(READ_KEY, String(ts)); } catch {}
}

export function hasUnreadAnnouncements(announcements) {
  if (!announcements || announcements.length === 0) return false;
  const lastRead = getLastRead();
  return new Date(announcements[0].createdAt).getTime() > lastRead;
}

function timeAgo(date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

export default function AnnouncementPanel({ isOpen, onClose, isAsen, onToast }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data } = await apiClient.announcements.list();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      console.error('[Announcements] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchAnnouncements();
      const latest = announcements[0];
      if (latest) setLastRead(new Date(latest.createdAt).getTime());
      else setLastRead(Date.now());
    }
  }, [isOpen]);

  useEffect(() => {
    if (announcements.length > 0) {
      setLastRead(new Date(announcements[0].createdAt).getTime());
    }
  }, [announcements]);

  const handlePost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      const { data } = await apiClient.announcements.create({ title: title.trim(), content: content.trim() });
      setAnnouncements((prev) => [data.announcement, ...prev]);
      setTitle('');
      setContent('');
      if (onToast) onToast('公告发布成功');
    } catch (err) {
      if (onToast) onToast(err.response?.data?.error || '发布失败');
    } finally {
      setPosting(false);
    }
  };

  if (!isOpen) return null;

  const spring = { type: 'spring', stiffness: 300, damping: 30, mass: 1 };

  const panelMotion = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: spring }
    : { initial: { opacity: 0, scale: 0.92, y: 20 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 10 }, transition: { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 } };

  const outerClass = isMobile
    ? 'fixed inset-0 z-[1800] flex items-end justify-center pointer-events-none'
    : 'fixed inset-0 z-[1800] flex items-center justify-center p-4 pointer-events-none';

  const panelClass = isMobile
    ? 'w-full max-h-[85vh] bg-black/40 backdrop-blur-lg border-t border-white/10 shadow-2xl rounded-t-2xl flex flex-col pointer-events-auto'
    : 'w-full max-w-lg max-h-[85vh] bg-black/40 backdrop-blur-lg border border-white/10 shadow-2xl rounded-2xl flex flex-col pointer-events-auto';

  const panelStyle = isMobile
    ? { paddingBottom: 'env(safe-area-inset-bottom)' }
    : {};

  const panelBody = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0
        border-b border-white/[0.06]"
        style={{ paddingTop: isMobile ? 'max(12px, env(safe-area-inset-top))' : undefined }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center">
            <Megaphone className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-white/90 font-semibold text-sm"
            style={{ fontFamily: 'var(--font-body)' }}>
            系统公告
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center
            hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
        >
          <X className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Admin post form */}
      {isAsen && (
        <div className="px-4 pt-4 pb-2 flex-shrink-0 border-b border-white/[0.04]">
          <p className="text-xs text-amber-400/60 mb-2 font-medium"
            style={{ fontFamily: 'var(--font-body)' }}>
            发布新公告
          </p>
          <input
            type="text"
            placeholder="公告标题（可选）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 mb-2 bg-white/[0.04] border border-white/[0.08] rounded-xl
              text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-400/30"
            style={{ fontFamily: 'var(--font-body)' }}
          />
          <textarea
            placeholder="公告内容…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl
              text-white/80 text-sm placeholder:text-white/20 resize-none
              focus:outline-none focus:border-amber-400/30 mb-2"
            style={{ fontFamily: 'var(--font-body)' }}
          />
          <button
            onClick={handlePost}
            disabled={posting || !content.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
              bg-gradient-to-r from-amber-500 to-orange-500
              text-white text-sm font-semibold
              hover:shadow-lg hover:shadow-amber-500/20
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            发布公告
          </button>
        </div>
      )}

      {/* Announcement list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 aurora-scroll"
        style={{ paddingBottom: isMobile ? undefined : undefined }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/20">
            <Megaphone className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>暂无公告</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <div
              key={ann._id}
              className="p-4 rounded-2xl
                bg-white/[0.03] border border-white/[0.06]
                hover:border-white/[0.10] transition-colors duration-200"
            >
              {ann.title && (
                <h3 className="text-sm font-semibold text-white/80 mb-1"
                  style={{ fontFamily: 'var(--font-body)' }}>
                  {ann.title}
                </h3>
              )}
              <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap"
                style={{ fontFamily: 'var(--font-body)' }}>
                {ann.content}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[11px] text-white/30">
                  {ann.author}
                </span>
                <span className="text-[11px] text-white/15">
                  {timeAgo(ann.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className={outerClass}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        {...panelMotion}
        className={panelClass}
        style={panelStyle}
      >
        {panelBody}
      </motion.div>
    </div>
  );
}
