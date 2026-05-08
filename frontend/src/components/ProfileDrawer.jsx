import { useEffect, useState } from 'react';
import { X, MapPin, Clock, MessageCircle, Heart, Footprints } from 'lucide-react';
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
    <div className="fixed inset-0 z-[2500]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="absolute top-0 right-0 h-full w-full md:w-96 bg-white shadow-2xl
          transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]
          translate-x-0 flex flex-col animate-slide-in"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !profile ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">用户不存在</p>
          </div>
        ) : (
          <>
            {/* Hero Banner */}
            <div className="relative h-32 bg-gradient-to-r from-blue-400 to-indigo-500 flex-shrink-0">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md
                  rounded-full text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar — overlapping banner and content */}
            <div className="relative px-5 h-14 flex-shrink-0">
              <div className="absolute -top-12">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center
                    text-white text-4xl font-bold border-4 border-white shadow-lg">
                    {(profile.name || '?')[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="px-5 pt-3 pb-4 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
            </div>

            {/* Stats */}
            <div className="flex justify-around px-5 pb-5 border-b border-gray-100 flex-shrink-0">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-sm font-bold text-gray-800">
                  <Footprints className="w-3.5 h-3.5 text-blue-500" />
                  {footprints.length}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">足迹</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-sm font-bold text-gray-800">
                  <Heart className="w-3.5 h-3.5 text-red-400" />
                  {totalReactions}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">获赞</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-sm font-bold text-gray-800">
                  <Clock className="w-3.5 h-3.5 text-green-500" />
                  {activeDays}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">活跃天数</p>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Recent interactions */}
              {(recentReactions.length > 0 || recentComments.length > 0) && (
                <div className="px-5 py-4 border-b border-gray-50">
                  <p className="text-xs text-gray-400 mb-2">最近互动</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentReactions.map((fp) => (
                      <span key={fp._id} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {fp.userId?.name || '?'}
                      </span>
                    ))}
                    {recentComments.map((fp) => (
                      <span key={fp._id} className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                        {fp.userId?.name || '?'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footprints */}
              <div className="px-5 py-4">
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
