import { useMemo, useState, useEffect } from 'react';
import useUIStore from '../store/useUIStore';
import { groupFootprintsByUser } from '../utils/groupFootprints';
import { AnimatePresence } from 'framer-motion';
import { X, MapPin, Clock, MessageCircle, Bell } from 'lucide-react';
import FootprintDetailModal from './FootprintDetailModal';
import { getReadMap, isUnread } from '../readStatus';
import { useFootprintActionsContext } from '../contexts/FootprintActionsContext';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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

  const grouped = groupFootprintsByUser(footprints);

  // Read once for all cards — check which footprints are unread
  const readMap = useMemo(() => getReadMap(), [footprints]);
  const unreadSet = useMemo(() => {
    const s = new Set();
    footprints.forEach((fp) => {
      if (isUnread(fp, readMap)) s.add(fp._id);
    });
    return s;
  }, [footprints, readMap]);
  const hasAnyUnread = unreadSet.size > 0;

  const placeName = footprints[0]?.placeName || 'this location';
  const count = footprints.length;

  if (footprints.length === 0) return null;

  const isSingle = footprints.length === 1;

  return (
    <>
      {/* Backdrop + Bottom Drawer — skip when single footprint modal is showing */}
      {!(isSingle && detailFp) && (
        <>
          <div
            className="fixed inset-0 z-[1500] bg-black/30 backdrop-blur-sm transition-opacity pointer-events-none"
            onClick={onClose}
          />

          <div
            className="fixed bottom-0 left-0 right-0 z-[1600] bg-black/40 backdrop-blur-lg border border-white/10 border-b-0 shadow-xl rounded-t-2xl
              max-h-[70vh] flex flex-col animate-slide-up"
            style={{ animation: 'slideUp 0.3s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div>
            <h2 className="font-bold text-lg text-white flex items-center gap-2">
              {count} footprint{count > 1 ? 's' : ''}
              {hasAnyUnread && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(34,211,238,0.12)', color: '#22d3ee' }}>
                  <Bell className="w-3 h-3" />
                  {unreadSet.size} 新消息
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-300 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {placeName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-300" />
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
                  onClick={() => user?._id && useUIStore.getState().openProfile(user._id)}
                >
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20 hover:ring-white/40 transition-all" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-white/40 transition-all">
                      {(user?.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </span>
                <span
                  className="cursor-pointer font-semibold text-sm text-gray-200 hover:text-white"
                  onClick={() => user?._id && useUIStore.getState().openProfile(user._id)}
                >
                  {user?.name || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500">{items.length} post{items.length > 1 ? 's' : ''}</span>
              </div>

              {/* Post Cards */}
              <div className="space-y-2">
                {items.map((fp) => {
                  const reactionCount = (fp.reactions || []).length;
                  const commentCount = fp.comments?.length || 0;
                  const fpUnread = unreadSet.has(fp._id);

                  return (
                    <div
                      key={fp._id}
                      onClick={() => setDetailFpId(fp._id)}
                      className={`flex gap-3 p-3 rounded-xl transition-colors cursor-pointer relative ${
                        fpUnread
                          ? 'bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {/* Unread badge */}
                      {fpUnread && (
                        <span className="absolute -top-1.5 -right-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold z-10"
                          style={{
                            background: '#22d3ee',
                            color: '#fff',
                            boxShadow: '0 0 8px rgba(34,211,238,0.5)',
                          }}>
                          新
                        </span>
                      )}
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
                          <span className="text-xs text-gray-500">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            {timeStr(fp.createdAt)}
                          </span>
                          {fp.mood && (
                            <span className="text-base leading-none">{fp.mood}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 line-clamp-2 whitespace-pre-wrap leading-relaxed">
                          {fp.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {reactionCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              {[...new Set((fp.reactions || []).map(r => r.emoji))].slice(0, 3).join('')}
                              {reactionCount > 1 && <span>{reactionCount}</span>}
                            </span>
                          )}
                          {commentCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
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
