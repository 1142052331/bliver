import { Eye, PencilLine, Zap, Trash2, Check, X } from 'lucide-react';

function UserAvatar({ user }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-blue-500/60 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-blue-500/30">
      {(user.name || '?')[0].toUpperCase()}
    </div>
  );
}

export default function AdminUsersTab({
  allUsers,
  editingId, editName, editPassword, saving,
  onEditNameChange, onEditPasswordChange,
  onEdit, onCancelEdit, onSaveEdit,
  onKick, onDelete, onViewProfile, onGhostMode,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">用户</th>
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">角色</th>
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">足迹</th>
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">最后IP</th>
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">状态</th>
            <th className="text-left px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
            <th className="text-right px-5 py-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {allUsers.map((u) => (
            <tr key={u._id} className="hover:bg-white/[0.03] transition-colors group">
              <td className="px-5 py-3">
                {editingId === u._id ? (
                  <input
                    value={editName}
                    onChange={onEditNameChange}
                    className="w-full px-2 py-1 text-sm border border-white/10 bg-white/5 text-gray-200 rounded focus:outline-none focus:border-blue-400"
                  />
                ) : (
                  <div
                    className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onViewProfile(u._id)}
                  >
                    <UserAvatar user={u} />
                    <span className="font-medium text-gray-200 group-hover:text-white transition-colors">
                      {u.name}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                  ${u.role === 'admin' ? 'bg-red-500/15 text-red-300 border border-red-500/20' : 'bg-white/10 text-gray-300'}`}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className="text-gray-400 font-mono text-xs">{u.footprintCount}</span>
              </td>
              <td className="px-5 py-3">
                <span className="text-[11px] text-gray-500 font-mono">
                  {u.lastLoginIp || <span className="text-gray-700 italic">N/A</span>}
                </span>
              </td>
              <td className="px-5 py-3">
                {u.isOnline ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    在线
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                    离线
                  </span>
                )}
              </td>
              <td className="px-5 py-3 text-xs text-gray-500 font-mono">
                {new Date(u.createdAt).toLocaleDateString('zh-CN')}
              </td>
              <td className="px-5 py-3">
                {editingId === u._id ? (
                  <div className="flex items-center gap-1 justify-end">
                    <input
                      value={editPassword}
                      onChange={onEditPasswordChange}
                      placeholder="新密码(可选)"
                      className="w-24 px-2 py-1 text-xs border border-white/10 bg-white/5 text-gray-200 rounded focus:outline-none focus:border-blue-400 placeholder:text-gray-500"
                    />
                    <button
                      onClick={() => onSaveEdit(u._id)}
                      disabled={saving}
                      className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="p-1.5 bg-white/10 text-gray-300 rounded-lg hover:bg-white/15 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : u.role !== 'admin' ? (
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => onGhostMode(u._id, u.name)}
                      className="p-1.5 hover:bg-amber-500/10 text-amber-400 rounded-lg transition-colors"
                      title="切换视角"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onEdit(u)}
                      className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onKick(u._id, u.name)}
                      className="p-1.5 hover:bg-orange-500/10 text-orange-400 rounded-lg transition-colors"
                      title="踢出"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(u._id, u.name)}
                      className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => onGhostMode(u._id, u.name)}
                      className="p-1.5 hover:bg-amber-500/10 text-amber-400 rounded-lg transition-colors"
                      title="切换视角"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
