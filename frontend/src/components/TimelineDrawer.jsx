import { useMemo } from 'react';
import { X, Clock } from 'lucide-react';

function UserTimeline({ user, items }) {
  const timeStr = (date) =>
    new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mb-6">
      {/* User header */}
      <div className="flex items-center gap-2 mb-3 pl-1">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0] || '?'}
          </div>
        )}
        <span className="font-semibold text-sm text-gray-800">{user?.name || 'Unknown'}</span>
      </div>

      {/* Timeline */}
      <div className="relative border-l-2 border-blue-200 ml-[13px] pl-5 space-y-4">
        {items.map((fp) => (
          <div key={fp._id} className="relative">
            {/* Dot */}
            <div className="absolute -left-[calc(1.25rem+7px)] top-1 w-2.5 h-2.5 bg-blue-500 rounded-full ring-4 ring-white" />
            {/* Time */}
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <Clock className="w-3 h-3" />
              {timeStr(fp.createdAt)}
            </div>
            {/* Content */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-medium text-gray-700 mb-0.5">
                📍 {fp.placeName || 'Unknown'}
              </p>
              <p className="text-sm text-gray-600">{fp.message}</p>
              {fp.photoUrl && (
                <img src={fp.photoUrl} className="mt-2 w-full max-h-[160px] object-cover rounded-lg" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TimelineDrawer({ isOpen, onClose, footprints }) {
  const grouped = useMemo(() => {
    const map = {};
    footprints.forEach((fp) => {
      const uid = fp.userId?._id || fp.userId || 'unknown';
      if (!map[uid]) map[uid] = { user: fp.userId || null, items: [] };
      map[uid].items.push(fp);
    });
    // Sort items within each group by createdAt ascending
    Object.values(map).forEach((g) => g.items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    return Object.values(map);
  }, [footprints]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-[1500] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[340px] max-w-[85vw] z-[1600] bg-white shadow-2xl
          transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-lg text-gray-800">Today&apos;s Journey</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-60px)] p-5">
          {grouped.length === 0 ? (
            <p className="text-gray-400 text-sm text-center mt-12">No footprints today yet.</p>
          ) : (
            grouped.map(({ user, items }) => (
              <UserTimeline key={user?._id || 'unknown'} user={user} items={items} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
