// @feature 集群详情面板 | Cluster Detail Panel | ClusterDetailPanel
import { useMemo, useState, useEffect } from 'react';
import useUIStore from '../store/useUIStore';
import { AnimatePresence } from 'framer-motion';
import { X, MapPin, Clock, MessageCircle } from 'lucide-react';
import FootprintDetailModal from './FootprintDetailModal';
import { getReadMap, isUnread } from '../readStatus';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// Extract province/state/prefecture from Nominatim placeName
// e.g. "深圳大学..., 广东省, 518060, 中国" → "广东省"
// e.g. "鴨部三丁目..., 高知县, 780-8571, 日本" → "高知县"
function extractRegion(placeName) {
  if (!placeName || placeName === 'Unknown location') return null;
  const parts = placeName.split(',').map(s => s.trim());
  const suffixes = ['省', '市', '自治区', '特别行政区', '县']; // 县 covers 日本县
  for (let i = parts.length - 1; i >= 0; i--) {
    if (suffixes.some(s => parts[i].endsWith(s))) return parts[i];
  }
  return null;
}

function getClusterLabel(footprints) {
  if (footprints.length === 0) return '附近';
  if (footprints.length === 1) return footprints[0].placeName || '附近';
  // Extract unique regions
  const regions = [...new Set(footprints.map(fp => extractRegion(fp.placeName)).filter(Boolean))];
  if (regions.length === 0) return footprints[0].placeName || '附近';
  if (regions.length === 1) return regions[0];
  return regions.join('、');
}

export default function ClusterDetailPanel({ footprints, userId, isAdmin, onClose, autoOpenId }) {
  const [detailFpId, setDetailFpId] = useState(null);
  const detailFp = detailFpId ? footprints.find(f => f._id === detailFpId) : null;

  // Auto-open detail for single footprint (from marker click) or timeline click
  useEffect(() => {
    if (autoOpenId) {
      console.log('[ClusterDetailPanel] autoOpenId:', autoOpenId);
      setDetailFpId(autoOpenId);
    } else if (footprints.length === 1) {
      console.log('[ClusterDetailPanel] auto-open single fp:', footprints[0]._id);
      setDetailFpId(footprints[0]._id);
    }
  }, [autoOpenId, footprints]);

  // Sort by time descending (newest first)
  const sorted = useMemo(
    () => [...footprints].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [footprints]
  );

  // Read once for all cards — check which footprints are unread
  const readMap = useMemo(() => getReadMap(userId), [footprints, userId]);
  const unreadSet = useMemo(() => {
    const s = new Set();
    footprints.forEach((fp) => {
      if (isUnread(fp, readMap)) s.add(fp._id);
    });
    return s;
  }, [footprints, readMap]);

  const placeName = getClusterLabel(footprints);
  const count = footprints.length;

  if (footprints.length === 0) return null;

  const isSingle = footprints.length === 1;

  return (
    <>
      {/* Backdrop + Bottom Drawer — skip when single footprint modal is showing */}
      {!(isSingle && detailFp) && (
        <>
          <div
            className="fixed inset-0 z-[1500] bg-black/30 backdrop-blur-sm transition-opacity pointer-events-auto"
            onClick={onClose}
          />

          <div
            className="fixed bottom-0 left-0 right-0 z-[1600] bg-black/40 backdrop-blur-lg border border-white/10 border-b-0 shadow-xl rounded-t-2xl
              max-h-[85vh] flex flex-col animate-slide-up"
            style={{ animation: 'slideUp 0.3s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            {count} 条足迹 · {placeName}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Feed */}
        <div className="overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {sorted.map((fp) => {
            const user = fp.userId || {};
            const reactionCount = (fp.reactions || []).length;
            const commentCount = fp.comments?.length || 0;
            const fpUnread = unreadSet.has(fp._id);

            return (
              <div
                key={fp._id}
                onClick={() => setDetailFpId(fp._id)}
                className={`px-4 py-3.5 border-b border-white/[0.06] cursor-pointer transition-colors ${
                  fpUnread
                    ? 'bg-cyan-500/[0.04] hover:bg-cyan-500/[0.07]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <span
                    className="cursor-pointer flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); user?._id && useUIStore.getState().openProfile(user._id); }}
                  >
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20 hover:ring-white/40 transition-all" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/20 hover:ring-white/40 transition-all">
                        {(user?.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name + mood + unread badge */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="cursor-pointer font-semibold text-[13px] text-cyan-400 hover:text-cyan-300 transition-colors"
                        onClick={(e) => { e.stopPropagation(); user?._id && useUIStore.getState().openProfile(user._id); }}
                      >
                        {user?.name || 'Unknown'}
                      </span>
                      {fp.mood && <span className="text-base leading-none">{fp.mood}</span>}
                      {fpUnread && (
                        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: '#22d3ee', color: '#fff', boxShadow: '0 0 8px rgba(34,211,238,0.4)' }}>
                          新
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed mt-1.5">
                      {fp.message}
                    </p>

                    {/* Photo */}
                    {fp.photoUrl && (
                      <img
                        src={fp.photoUrl}
                        className="rounded-lg max-h-48 object-cover mt-2"
                        onError={(e) => { e.target.style.display = 'none'; }}
                        loading="lazy"
                      />
                    )}

                    {/* Place + Time */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {fp.placeName || '未知位置'}
                      </span>
                      <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {timeStr(fp.createdAt)}
                      </span>
                    </div>

                    {/* Reactions + Comments */}
                    {(reactionCount > 0 || commentCount > 0) && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.05]">
                        {reactionCount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500">
                            {[...new Set((fp.reactions || []).map(r => r.emoji))].slice(0, 3).join('')}
                            {reactionCount > 1 && <span>{reactionCount}</span>}
                          </span>
                        )}
                        {commentCount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500">
                            <MessageCircle className="w-3 h-3" />
                            {commentCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {detailFp && (
          <FootprintDetailModal
            key={detailFp._id}
            fp={detailFp}
            allFootprints={footprints}
            userId={userId}
            isAdmin={isAdmin}
            onClose={() => {
              if (isSingle) onClose();
              else setDetailFpId(null);
            }}
          />
        )}
      </AnimatePresence>

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
