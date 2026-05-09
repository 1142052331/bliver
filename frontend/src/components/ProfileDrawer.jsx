import { useEffect, useState, useRef } from 'react';
import { X, MapPin, Clock, MessageCircle, Heart, Footprints, Camera, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import api from '../api';
import { getUser } from '../auth';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function ProfileDrawer({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [recentReactions, setRecentReactions] = useState([]);
  const [recentComments, setRecentComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');
  const bannerFileRef = useRef(null);

  const currentUser = getUser();
  const isOwnProfile = currentUser?._id === userId;

  const handleBannerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBanner(true);
    setBannerMsg('');
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
      const form = new FormData();
      form.append('banner', compressed);
      const { data } = await api.post('/api/users/profile/banner', form);
      setProfile(data.user);
      setBannerMsg('背景更换成功！');
      setTimeout(() => setBannerMsg(''), 3000);
    } catch (err) {
      setBannerMsg(err.response?.data?.error || '上传失败');
      setTimeout(() => setBannerMsg(''), 3000);
    }
    setUploadingBanner(false);
  };

  const fetchProfile = async () => {
    try {
      const { data } = await api.get(`/api/users/${userId}/profile`);
      setProfile(data.user);
      setFootprints(data.footprints);
      setRecentReactions(data.recentReactions);
      setRecentComments(data.recentComments);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, [userId]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const onNewFp = (e) => {
      const fp = e.detail.footprint;
      if (fp.userId?._id === userId || fp.userId === userId) {
        setFootprints((prev) => [fp, ...prev]);
      }
    };
    const onUpdateFp = (e) => {
      const fp = e.detail.footprint;
      setFootprints((prev) =>
        prev.map((f) => (f._id === fp._id
          ? { ...f, reactions: fp.reactions, comments: fp.comments }
          : f))
      );
    };
    const onDeleteFp = (e) => {
      setFootprints((prev) => prev.filter((f) => f._id !== e.detail.footprintId));
    };
    const onProfileUpdated = (e) => {
      if (e.detail.userId === userId) setProfile(e.detail.user);
    };

    window.addEventListener('ws:footprint:new', onNewFp);
    window.addEventListener('ws:footprint:updated', onUpdateFp);
    window.addEventListener('ws:footprint:deleted', onDeleteFp);
    window.addEventListener('ws:profile:updated', onProfileUpdated);
    return () => {
      window.removeEventListener('ws:footprint:new', onNewFp);
      window.removeEventListener('ws:footprint:updated', onUpdateFp);
      window.removeEventListener('ws:footprint:deleted', onDeleteFp);
      window.removeEventListener('ws:profile:updated', onProfileUpdated);
    };
  }, [userId]);

  const totalReactions = footprints.reduce((sum, fp) => sum + (fp.reactions?.length || 0), 0);
  const activeDays = (() => {
    const days = new Set();
    footprints.forEach((fp) => days.add(new Date(fp.createdAt).toDateString()));
    return days.size;
  })();

  return (
    <div className="fixed inset-0 z-[2500] pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="absolute top-0 right-0 h-full w-full md:w-96 bg-white shadow-2xl
          transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]
          translate-x-0 flex flex-col animate-slide-in pointer-events-auto"
      >
        {loading ? (
          <div className="flex flex-col h-full animate-pulse">
            {/* Banner skeleton */}
            <div className="h-28 bg-gray-200" />
            {/* Avatar skeleton */}
            <div className="relative px-5 h-10">
              <div className="absolute -top-10 w-20 h-20 rounded-full bg-gray-300 border-4 border-white" />
            </div>
            {/* Name skeleton */}
            <div className="px-5 pt-2 pb-3">
              <div className="h-5 w-24 bg-gray-200 rounded" />
            </div>
            {/* Stats skeleton */}
            <div className="flex justify-around px-5 pb-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-4 w-10 bg-gray-200 rounded" />
                  <div className="h-3 w-8 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
            {/* Footprint card skeletons */}
            <div className="flex-1 px-5 space-y-3 overflow-hidden">
              <div className="h-3 w-16 bg-gray-200 rounded mt-3" />
              {[1,2,3].map(i => (
                <div key={i} className="bg-gray-100 rounded-xl p-3 space-y-2">
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                  <div className="h-3 w-32 bg-gray-200 rounded" />
                  <div className="h-16 bg-gray-200 rounded-lg" />
                  <div className="h-4 w-full bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : !profile ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">用户不存在</p>
          </div>
        ) : (
          <>
            {/* ── Immersive Banner Section ──────────────────── */}
            <div className="relative flex-shrink-0">
              {/* Background image or gradient */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 bg-cover bg-center"
                style={profile.profileBannerUrl ? {
                  backgroundImage: `url(${profile.profileBannerUrl})`,
                } : undefined}
              />
              {/* Dark gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80" />

              {/* Foreground content */}
              <div className="relative z-10">
                {/* Banner area */}
                <div className="relative h-28">
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {isOwnProfile && (
                      <>
                        <input
                          type="file"
                          accept="image/*"
                          ref={bannerFileRef}
                          onChange={handleBannerUpload}
                          className="hidden"
                        />
                        <button
                          onClick={() => bannerFileRef.current?.click()}
                          disabled={uploadingBanner}
                          className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md
                            rounded-full text-white transition-colors disabled:opacity-50"
                          title="更换背景"
                        >
                          {uploadingBanner ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Camera className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md
                        rounded-full text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {bannerMsg && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5
                      bg-black/50 backdrop-blur-sm text-white text-xs rounded-full">
                      {bannerMsg}
                    </div>
                  )}
                </div>

                {/* Avatar — overlapping */}
                <div className="relative px-5 h-10">
                  <div className="absolute -top-10">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        className="w-20 h-20 rounded-full object-cover border-4 border-white/30 shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center
                        text-white text-3xl font-bold border-4 border-white/30 shadow-lg">
                        {(profile.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Name */}
                <div className="px-5 pt-2 pb-3">
                  <h2 className="text-lg font-bold text-white drop-shadow-md">{profile.name}</h2>
                </div>

                {/* Stats */}
                <div className="flex justify-around px-5 pb-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm font-bold text-white drop-shadow-md">
                      <Footprints className="w-3.5 h-3.5 text-blue-300" />
                      {footprints.length}
                    </div>
                    <p className="text-xs text-white/70 mt-0.5 drop-shadow-sm">足迹</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm font-bold text-white drop-shadow-md">
                      <Heart className="w-3.5 h-3.5 text-red-300" />
                      {totalReactions}
                    </div>
                    <p className="text-xs text-white/70 mt-0.5 drop-shadow-sm">获赞</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm font-bold text-white drop-shadow-md">
                      <Clock className="w-3.5 h-3.5 text-green-300" />
                      {activeDays}
                    </div>
                    <p className="text-xs text-white/70 mt-0.5 drop-shadow-sm">活跃天数</p>
                  </div>
                </div>

                {/* Recent interactions */}
                {(recentReactions.length > 0 || recentComments.length > 0) && (
                  <div className="px-5 pb-3">
                    <p className="text-xs text-white/80 mb-2 drop-shadow-md">最近互动</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recentReactions.map((fp) => (
                        <span key={fp._id} className="text-xs bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
                          {fp.userId?.name || '?'}
                        </span>
                      ))}
                      {recentComments.map((fp) => (
                        <span key={fp._id} className="text-xs bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
                          {fp.userId?.name || '?'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Footprints (white background) ──────────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white rounded-t-3xl -mt-3 relative z-10">
              <div className="px-5 pt-5 pb-4">
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  历史足迹
                </p>
                {footprints.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">还没有发布过足迹</p>
                ) : (
                  <div className="space-y-3">
                    {footprints.map((fp) => (
                      <div key={fp._id} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Clock className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-400">{timeAgo(fp.createdAt)}</span>
                          {fp.mood && <span className="text-sm">{fp.mood}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mb-1">
                          <MapPin className="w-3 h-3 inline mr-0.5" />
                          {fp.placeName || 'Unknown'}
                        </p>
                        {fp.photoUrl && (
                          <img
                            src={fp.photoUrl}
                            className="w-full max-h-[200px] object-cover rounded-lg mt-2 mb-2"
                          />
                        )}
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {fp.message}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {(fp.reactions || []).length}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {(fp.comments || []).length}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in { animation: slide-in 0.3s cubic-bezier(0.2,0.8,0.2,1); }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}
