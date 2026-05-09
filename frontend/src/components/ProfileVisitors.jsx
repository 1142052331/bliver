import { useMemo } from 'react';

/**
 * 最近访客展示（去重后最近 3 位），含头像和名字。
 */
export default function ProfileVisitors({ visitors }) {
  const recent = useMemo(() => {
    if (!visitors?.length) return [];
    const seen = new Map();
    visitors.forEach((v) => {
      if (v.visitorId?._id) seen.set(v.visitorId._id, v);
    });
    return Array.from(seen.values()).slice(-3).reverse();
  }, [visitors]);

  if (!recent.length) return null;

  return (
    <div className="px-5 pb-3">
      <p className="text-xs text-white/80 mb-2 drop-shadow-md">最近访客</p>
      <div className="flex items-center gap-2">
        {recent.map((v) => (
          <div key={v._id} className="flex items-center gap-1.5">
            {v.visitorId?.avatarUrl ? (
              <img src={v.visitorId.avatarUrl} className="w-6 h-6 rounded-full object-cover border border-white/30" alt="" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                {(v.visitorId?.name || '?')[0]}
              </div>
            )}
            <span className="text-xs text-white/60">{v.visitorId?.name || '?'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
