import { useMemo } from 'react';
import { X, MapPin, Heart, MessageCircle, Image } from 'lucide-react';

export default function PhotoWall({ footprints, onClose, onSelect }) {
  const photos = useMemo(() => {
    return footprints
      .filter((fp) => fp.photoUrl)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [footprints]);

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-gray-950/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 text-white" />
          <h2 className="font-bold text-lg text-white">照片墙</h2>
          <span className="text-sm text-white/50 ml-1">{photos.length} 张</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Waterfall grid */}
      {photos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Image className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">还没有人分享照片</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
            {photos.map((fp) => (
              <div
                key={fp._id}
                className="break-inside-avoid rounded-xl overflow-hidden bg-white/5
                  hover:bg-white/10 transition-all cursor-pointer group relative"
                onClick={() => onSelect && onSelect(fp._id)}
              >
                <img
                  src={fp.photoUrl}
                  loading="lazy"
                  className="w-full object-cover"
                  alt={fp.placeName || 'Photo'}
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent
                  opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-sm font-medium truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {fp.placeName || 'Unknown'}
                    </p>
                    {fp.message && (
                      <p className="text-white/70 text-xs mt-1 line-clamp-2">{fp.message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-white/60 text-xs">
                        <Heart className="w-3 h-3" />
                        {fp.reactions?.length || 0}
                      </span>
                      <span className="flex items-center gap-1 text-white/60 text-xs">
                        <MessageCircle className="w-3 h-3" />
                        {fp.comments?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* User avatar + name */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm
                  rounded-full px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {fp.userId?.avatarUrl ? (
                    <img src={fp.userId.avatarUrl} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] font-bold">
                      {(fp.userId?.name || '?')[0]}
                    </div>
                  )}
                  <span className="text-white text-xs">{fp.userId?.name || '?'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
