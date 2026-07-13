import { AlertTriangle, Check, UserX } from 'lucide-react';

function CloneGroup({ group, onViewProfile }) {
  const sorted = [...group.users].sort(
    (a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0)
  );

  return (
    <div className="rounded-xl border border-red-500/20 bg-black/40 overflow-hidden hover:border-red-500/40 transition-all">
      <div className="px-5 py-3.5 border-b border-red-500/10 bg-red-500/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <UserX className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-red-300">
              同一人？{sorted.length} 个账号
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              group.type === 'registerIp'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
            }`}>
              {group.type === 'registerIp' ? '同注册IP' : '同登录IP'}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">{group.ip}</span>
        </div>
        <p className="text-[11px] text-gray-600 mt-1 ml-6">
          {group.type === 'registerIp'
            ? '这些账号使用了相同的 IP 地址注册，极可能为同一人'
            : '这些账号曾使用相同的 IP 地址登录，可能存在关联'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">账号</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">角色</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">最后登录</th>
              <th className="text-left px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">注册IP</th>
              <th className="text-center px-5 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((u) => (
              <tr
                key={u._id}
                className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                onClick={() => onViewProfile(u._id)}
              >
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" decoding="async" className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-[9px] font-bold">
                        {(u.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-200">{u.name}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    u.role === 'admin'
                      ? 'bg-red-500/15 text-red-300 border border-red-500/20'
                      : 'bg-white/10 text-gray-400'
                  }`}>
                    {u.role === 'admin' ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-xs text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-5 py-2.5 text-xs text-gray-400">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString('zh-CN')
                    : <span className="text-gray-700 italic">从未登录</span>
                  }
                </td>
                <td className="px-5 py-2.5">
                  <span className="text-[11px] text-gray-500 font-mono">{u.registerIp || 'N/A'}</span>
                </td>
                <td className="px-5 py-2.5 text-center">
                  {u.isOnline ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      在线
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600">离线</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminClonesTab({ cloneData, onViewProfile }) {
  if (!cloneData) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-red-500/5 via-orange-500/5 to-red-500/5 border border-red-500/10">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-red-300 tracking-wide">风控雷达扫描完成</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            共扫描 <span className="text-gray-200 font-mono">{cloneData.totalUsers}</span> 名用户，
            发现 <span className="text-orange-400 font-mono font-bold">{cloneData.groups.length}</span> 组共享IP账号，
            涉及 <span className="text-red-400 font-mono font-bold">{cloneData.suspiciousCount}</span> 个可疑账号
          </p>
        </div>
      </div>

      {cloneData.groups.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-sm text-gray-400">未发现同IP关联账号</p>
          <p className="text-xs text-gray-600 mt-1 font-mono">NO CLONES DETECTED</p>
        </div>
      ) : (
        <div className="space-y-5">
          {cloneData.groups.map((group, gi) => (
            <CloneGroup key={gi} group={group} onViewProfile={onViewProfile} />
          ))}
        </div>
      )}
    </div>
  );
}
