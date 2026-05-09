import { useMemo, useState, useEffect } from 'react';
import { X, MapPin, Clock, MessageCircle } from 'lucide-react';
import FootprintDetailModal from './FootprintDetailModal';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function ClusterDetailPanel({ footprints, userId, isAdmin, onReact, onDelete, onShare, onComment, onDeleteComment, onClose, autoOpenId }) {
  const [detailFpId, setDetailFpId] = useState(null);
  const detailFp = detailFpId ? footprints.find(f => f._id === detailFpId) : null;

  // Auto-open detail modal triggered by timeline click (via activeFootprintId)
  useEffect(() => {
    if (autoOpenId) {
      setDetailFpId(autoOpenId);
    }
  }, [autoOpenId]);

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
            className="fixed bottom-0 left-0 right-0 z-[1600] bg-white rounded-t-2xl shadow-2xl
              max-h-[70vh] flex flex-col animate-slide-up"
            style={{ animation: 'slideUp 0.3s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }}
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
        </>
      )}

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
          onDeleteComment={onDeleteComment}
          onClose={() => {
            if (isSingle) onClose(); // close everything for single footprint
            else setDetailFpId(null); // just close modal, keep drawer open
          }}
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
