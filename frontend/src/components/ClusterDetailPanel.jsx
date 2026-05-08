import { useMemo, useState } from 'react';
import { X, Heart, Trash2, Share2, Check, MapPin, Clock, Image } from 'lucide-react';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function FootprintDetailModal({ fp, userId, isAdmin, onLike, onDelete, onShare, onClose }) {
  if (!fp) return null;

  const liked = fp.likes?.some((l) => (l._id || l) === userId);
  const likeCount = fp.likes?.length || 0;
  const likeNames = fp.likes?.map((l) => l.name || '?').join(', ') || '';
  const [copied, setCopied] = useState(false);

  const user = fp.userId || {};

  return (
    <div className="fixed inset-0 z-[1800] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl z-10">
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
            {user.avatarUrl ? (
              <img src={user.avatarUrl} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                {(user.name || '?')[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-800">{user.name || 'Unknown'}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                {new Date(fp.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Location */}
          <p className="text-sm text-gray-500 mb-2">
            <MapPin className="w-3.5 h-3.5 inline mr-1" />
            {fp.placeName || 'Unknown location'}
          </p>

          {/* Message */}
          <p className="text-gray-700 whitespace-pre-wrap text-[15px] leading-relaxed mb-4">
            {fp.message}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <button
              onClick={() => onLike(fp._id)}
              className="flex items-center gap-1.5 hover:scale-110 transition-transform"
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
              {likeCount > 0 && (
                <span className="text-xs text-gray-500" title={likeNames}>
                  {likeCount} {likeNames && `— ${likeNames}`}
                </span>
              )}
            </button>

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
        </div>
      </div>
    </div>
  );
}

export default function ClusterDetailPanel({ footprints, userId, isAdmin, onLike, onDelete, onShare, onClose }) {
  const [detailFp, setDetailFp] = useState(null);

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
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-100" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                    {(user?.name || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="font-semibold text-sm text-gray-800">{user?.name || 'Unknown'}</span>
                <span className="text-xs text-gray-400">{items.length} post{items.length > 1 ? 's' : ''}</span>
              </div>

              {/* Post Cards */}
              <div className="space-y-2">
                {items.map((fp) => {
                  const liked = fp.likes?.some((l) => (l._id || l) === userId);
                  const likeCount = fp.likes?.length || 0;

                  return (
                    <div
                      key={fp._id}
                      onClick={() => setDetailFp(fp)}
                      className="flex gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      {/* Thumbnail */}
                      {fp.photoUrl ? (
                        <img
                          src={fp.photoUrl}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center">
                          <Image className="w-6 h-6 text-gray-300" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-gray-400">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            {timeStr(fp.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap leading-relaxed">
                          {fp.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Heart className={`w-3 h-3 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
                            {likeCount || ''}
                          </span>
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
          onLike={onLike}
          onDelete={onDelete}
          onShare={onShare}
          onClose={() => setDetailFp(null)}
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
