// @feature 照片墙 | Photo Wall | PhotoWall
import { memo, useMemo, useEffect, useState } from 'react';
import { X, MapPin, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { recordMetric } from '../observability';

export const PhotoCard = memo(function PhotoCard({ fp, index, onSelect }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="break-inside-avoid rounded-2xl overflow-hidden cursor-pointer
        group relative shadow-lg shadow-black/20 hover:shadow-2xl hover:shadow-black/40
        hover:scale-[1.02] transition-all duration-500 ease-out"
      style={{
        animationDelay: `${index * 80}ms`,
        opacity: loaded ? 1 : 0,
        transform: loaded ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
      }}
      onClick={() => onSelect && onSelect(fp._id)}
    >
      {failed ? (
        <div className="bliver-photo-wall__placeholder" role="img" aria-label="照片暂时无法加载">照片暂时无法加载</div>
      ) : (
        <img
          src={fp.photoUrl}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => { setFailed(true); recordMetric('legacy_surface_error', { surface: 'photo', status: 'error', reason: 'image-load' }); }}
          className="w-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          alt={fp.placeName || '照片'}
        />
      )}

      {/* Always-visible info strip */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-3 px-3">
        <div className="flex items-center gap-2 mb-1">
          {fp.userId?.avatarUrl ? (
            <img src={fp.userId.avatarUrl} alt="" decoding="async" className="w-5 h-5 rounded-full object-cover ring-1 ring-white/30" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[9px] font-bold ring-1 ring-white/30">
              {(fp.userId?.name || '?')[0]}
            </div>
          )}
          <span className="text-white/90 text-xs font-medium truncate">
            {fp.userId?.name || '?'}
          </span>
        </div>
        <p className="text-white text-sm font-semibold leading-tight truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 text-rose-400 flex-shrink-0" />
          {fp.placeName || '未知地点'}
        </p>
        {fp.message && (
          <p className="text-white/60 text-xs mt-0.5 line-clamp-1 leading-relaxed">{fp.message}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-white/50 text-xs">
            <Heart className="w-3 h-3 text-rose-400" />
            {fp.reactions?.length || 0}
          </span>
          <span className="flex items-center gap-1 text-white/50 text-xs">
            <MessageCircle className="w-3 h-3 text-blue-400" />
            {fp.comments?.length || 0}
          </span>
          {fp.mood && <span className="text-sm ml-auto">{fp.mood}</span>}
        </div>
      </div>
    </div>
  );
});

export default function PhotoWall({ footprints, onClose, onSelect }) {
  const [visible, setVisible] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  const photos = useMemo(() => {
    return footprints
      .filter((fp) => fp.photoUrl)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [footprints]);

  const heroPhoto = photos[0];
  const gridPhotos = photos.slice(1);

  useEffect(() => {
    recordMetric('legacy_surface_open', { surface: 'photo', status: 'ok' });
    requestAnimationFrame(() => setVisible(true));
    return () => setVisible(false);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[2000] flex flex-col transition-opacity duration-300 bliver-legacy-surface bliver-photo-wall ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-wall-title"
      style={{ background: 'var(--bliver-paper)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0
        bg-gradient-to-b from-black/60 to-transparent absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h2 id="photo-wall-title" className="font-bold text-lg text-white tracking-tight">照片墙</h2>
          <span className="text-xs text-white/40 bg-white/10 rounded-full px-2 py-0.5 ml-1">
            {photos.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all bliver-icon-button"
          aria-label="关闭照片墙"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      {photos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center animate-pulse">
            <div className="w-24 h-24 rounded-3xl aurora-btn flex items-center justify-center mx-auto mb-4"
              style={{ boxShadow: '0 0 40px var(--aurora-glow-teal)' }}>
              <Sparkles className="w-10 h-10 text-white/60" />
            </div>
            <p className="text-white/30 text-sm font-medium">等待第一张照片...</p>
            <p className="text-white/15 text-xs mt-1">打卡时上传照片就会出现在这里</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Hero Photo */}
          {heroPhoto && (
            <div
              className="relative w-full h-[50vh] md:h-[60vh] cursor-pointer group overflow-hidden"
              onClick={() => onSelect && onSelect(heroPhoto._id)}
            >
              {heroFailed ? (
                <div className="bliver-photo-wall__placeholder bliver-photo-wall__placeholder--hero" role="img" aria-label="照片暂时无法加载">照片暂时无法加载</div>
              ) : (
                <img
                  src={heroPhoto.photoUrl}
                  loading="eager"
                  decoding="async"
                  onError={() => { setHeroFailed(true); recordMetric('legacy_surface_error', { surface: 'photo', status: 'error', reason: 'image-load' }); }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out"
                  alt={`${heroPhoto.placeName || '地点'}照片`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-black/20 to-transparent" />

              {/* Hero info */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
                <div className="flex items-center gap-3 mb-3">
                  {heroPhoto.userId?.avatarUrl ? (
                    <img src={heroPhoto.userId.avatarUrl} alt="" decoding="async" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/30" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/30">
                      {(heroPhoto.userId?.name || '?')[0]}
                    </div>
                  )}
                  <div>
                    <p className="text-white font-semibold">{heroPhoto.userId?.name || '?'}</p>
                    <p className="text-white/50 text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {heroPhoto.placeName || '未知地点'}
                    </p>
                  </div>
                </div>
                {heroPhoto.message && (
                  <p className="text-white/80 text-lg md:text-xl font-medium max-w-2xl leading-relaxed mb-3">
                    {heroPhoto.message}
                  </p>
                )}
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-white/60 text-sm">
                    <Heart className="w-4 h-4 text-rose-400" />
                    {heroPhoto.reactions?.length || 0}
                  </span>
                  <span className="flex items-center gap-1.5 text-white/60 text-sm">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    {heroPhoto.comments?.length || 0}
                  </span>
                  {heroPhoto.mood && <span className="text-2xl ml-auto">{heroPhoto.mood}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Grid */}
          {gridPhotos.length > 0 && (
            <div className="px-3 md:px-5 pb-10 pt-4">
              <p className="text-white/30 text-xs font-medium uppercase tracking-widest mb-4 px-2">
                更多瞬间
              </p>
              <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
                {gridPhotos.map((fp, i) => (
                  <PhotoCard key={fp._id} fp={fp} index={i} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
