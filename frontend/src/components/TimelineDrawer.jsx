import { useMemo, useState } from 'react';
import { X, Clock, Trash2, Share2, Check } from 'lucide-react';
import ReactionPicker from './ReactionPicker';

function UserTimeline({ user, items, userId, isAdmin, onReact, onDelete, onShare, onSelectFootprint }) {
  const timeStr = (date) =>
    new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (fpId) => {
    onShare(fpId);
    setCopiedId(fpId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 pl-1">
        <span
          className="cursor-pointer"
          onClick={() => user?._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} className="w-7 h-7 rounded-full object-cover hover:ring-2 hover:ring-blue-300 transition-all" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-blue-300 transition-all">
              {user?.name?.[0] || '?'}
            </div>
          )}
        </span>
        <span
          className="cursor-pointer font-semibold text-sm text-gray-800 hover:text-blue-600"
          onClick={() => user?._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
        >
          {user?.name || 'Unknown'}
        </span>
      </div>

      <div className="relative border-l-2 border-blue-200 ml-[13px] pl-5 space-y-4">
        {items.map((fp) => {
          const copied = copiedId === fp._id;

          return (
            <div key={fp._id} className="relative">
              <div className="absolute -left-[calc(1.25rem+7px)] top-1 w-2.5 h-2.5 bg-blue-500 rounded-full ring-4 ring-white" />
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                <Clock className="w-3 h-3" />
                {timeStr(fp.createdAt)}
              </div>
              <div
                className="bg-gray-50 rounded-xl p-3 cursor-pointer hover:bg-blue-50 hover:shadow-sm transition-all"
                onClick={() => onSelectFootprint && onSelectFootprint(fp._id)}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-gray-700">
                    📍 {fp.placeName || 'Unknown'}
                  </p>
                  {fp.mood && (
                    <span className="text-lg leading-none">{fp.mood}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{fp.message}</p>
                {fp.photoUrl && (
                  <img src={fp.photoUrl} className="mt-2 w-full max-h-[160px] object-cover rounded-lg" />
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200"
                  onClick={(e) => e.stopPropagation()}>
                  <ReactionPicker fp={fp} userId={userId} onReact={onReact} />

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(fp._id)}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Copy link"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => onDelete(fp._id)}
                        className="p-1 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PERIODS = [
  { key: 'today', label: '本日' },
  { key: 'week', label: '本周' },
  { key: 'year', label: '本年' },
];

export default function TimelineDrawer({ isOpen, onClose, footprints, userId, isAdmin, onReact, onDelete, onShare, onSelectFootprint, period, onChangePeriod, loading }) {
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

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[1500] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[360px] max-w-[85vw] z-[1600] bg-white shadow-2xl
          transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg text-gray-800">足迹记录</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          {/* Period pills */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => onChangePeriod && onChangePeriod(p.key)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${period === p.key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="animate-pulse space-y-5">
              {[1,2,3].map(i => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-gray-200" />
                    <div className="h-4 w-20 bg-gray-200 rounded" />
                  </div>
                  <div className="ml-4 pl-5 space-y-3 border-l-2 border-gray-100">
                    {[1,2].map(j => (
                      <div key={j} className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <div className="h-3 w-12 bg-gray-200 rounded" />
                        <div className="h-4 w-32 bg-gray-200 rounded" />
                        <div className="h-4 w-full bg-gray-100 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-gray-400 text-sm text-center mt-12">暂无足迹记录</p>
          ) : (
            grouped.map(({ user, items }) => (
              <UserTimeline
                key={user?._id || 'unknown'}
                user={user}
                items={items}
                userId={userId}
                isAdmin={isAdmin}
                onReact={onReact}
                onDelete={onDelete}
                onShare={onShare}
                onSelectFootprint={onSelectFootprint}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
