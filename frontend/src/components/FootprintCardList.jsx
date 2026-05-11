import { MapPin, Clock, MessageCircle, Heart, LogOut } from 'lucide-react';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

/**
 * 足迹历史列表 + 退出登录按钮。
 */
export default function FootprintCardList({ footprints, isOwnProfile, onLogout, onSelectFootprint }) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/5 rounded-t-3xl -mt-3 relative z-10">
      <div className="px-5 pt-5 pb-4">
        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          历史足迹
        </p>

        {footprints.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">还没有发布过足迹</p>
        ) : (
          <div className="space-y-3">
            {footprints.map((fp) => (
              <div key={fp._id} className="bg-white/5 rounded-xl p-3 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => onSelectFootprint?.(fp._id)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-xs text-gray-500">{timeAgo(fp.createdAt)}</span>
                  {fp.mood && <span className="text-sm">{fp.mood}</span>}
                </div>
                <p className="text-xs text-gray-400 mb-1">
                  <MapPin className="w-3 h-3 inline mr-0.5" />
                  {fp.placeName || 'Unknown'}
                </p>
                {fp.photoUrl && (
                  <img
                    src={fp.photoUrl}
                    alt=""
                    className="w-full max-h-[200px] object-cover rounded-lg mt-2 mb-2"
                  />
                )}
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {fp.message}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
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

        {isOwnProfile && onLogout && (
          <button
            onClick={onLogout}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl
              bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        )}
      </div>
    </div>
  );
}
