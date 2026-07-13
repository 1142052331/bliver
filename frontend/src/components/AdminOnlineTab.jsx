import { WifiOff } from 'lucide-react';

export default function AdminOnlineTab({ onlineUsers, onViewProfile }) {
  if (onlineUsers.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
            <WifiOff className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-sm text-gray-500">暂无在线用户</p>
          <p className="text-xs text-gray-600 mt-1 font-mono">NO ACTIVE CONNECTIONS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-2">
        {onlineUsers.map((u) => (
          <div
            key={u.socketId}
            className="flex items-center justify-between p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all group"
          >
            <div
              className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
              onClick={() => onViewProfile(u.userId)}
            >
              <div className="relative shrink-0">
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt=""
                    decoding="async"
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30"
                    onError={(e) => { e.target.style.display = 'none'; }}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-600/60 flex items-center justify-center text-white text-xs font-bold ring-2 ring-emerald-500/30">
                    {(u.name || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate">
                  {u.name}
                </p>
                <p className="text-[10px] text-gray-500 font-mono truncate">
                  SOCK: {u.ip}
                  {u.lastLoginIp && u.lastLoginIp !== u.ip && (
                    <span className="text-gray-600 ml-1">| DB: {u.lastLoginIp}</span>
                  )}
                  {u.registerIp && (
                    <span className="text-gray-700 ml-1">| REG: {u.registerIp}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-[10px] text-emerald-500/60 font-mono tracking-wider bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                LIVE
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
