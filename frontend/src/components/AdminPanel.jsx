import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Users, Shield, Trash2, Edit3, Zap, RefreshCw, Wifi, WifiOff, Check, PencilLine } from 'lucide-react';
import api from '../api';

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('users'); // 'online' | 'users'
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const msgTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(msgTimerRef.current), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [onlineRes, usersRes] = await Promise.all([
        api.get('/api/admin/online'),
        api.get('/api/admin/users'),
      ]);
      setOnlineUsers(onlineRes.data.online);
      setAllUsers(usersRes.data.users);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showMsg = (msg) => {
    setActionMsg(msg);
    clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setActionMsg(''), 3000);
  };

  const handleKick = async (userId, name) => {
    if (!confirm(`确认踢出用户 ${name}？`)) return;
    try {
      await api.post(`/api/admin/kick/${userId}`);
      showMsg(`${name} 已被踢出`);
      fetchData();
    } catch (err) { showMsg(err.response?.data?.error || err.message); }
  };

  const handleDelete = async (userId, name) => {
    if (!confirm(`确认删除用户 ${name} 及其所有足迹？此操作不可逆！`)) return;
    try {
      await api.delete(`/api/admin/users/${userId}`);
      showMsg(`${name} 已被删除`);
      fetchData();
    } catch (err) { showMsg(err.response?.data?.error || err.message); }
  };

  const handleEdit = (user) => {
    setEditingId(user._id);
    setEditName(user.name);
    setEditPassword('');
  };

  const handleSaveEdit = async (userId) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const body = { name: editName.trim() };
      if (editPassword.trim()) body.password = editPassword.trim();
      await api.put(`/api/admin/users/${userId}`, body);
      showMsg('修改成功');
      setEditingId(null);
      fetchData();
    } catch (err) { showMsg(err.response?.data?.error || err.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-lg text-gray-800">后台管理</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button
            onClick={() => setTab('online')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${tab === 'online' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Users className="w-4 h-4 inline mr-1" />
            在线人员 ({onlineUsers.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${tab === 'users' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Shield className="w-4 h-4 inline mr-1" />
            所有用户 ({allUsers.length})
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {tab === 'online' && (
                <div className="p-6">
                  {onlineUsers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">暂无在线用户</p>
                  ) : (
                    <div className="space-y-2">
                      {onlineUsers.map((u) => (
                        <div key={u.socketId} className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                          <div className="flex items-center gap-3 cursor-pointer"
                            onClick={() => u._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: u._id } }))}
                          >
                            <div className="relative">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                  {(u.name || '?')[0].toUpperCase()}
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{u.name}</p>
                              <p className="text-xs text-gray-400">IP: {u.ip}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-green-500" />
                            <span className="text-xs text-gray-400">在线</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'users' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">用户</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">角色</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">足迹</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">状态</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">注册时间</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {allUsers.map((u) => (
                        <tr key={u._id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-3">
                            {editingId === u._id ? (
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                              />
                            ) : (
                              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => u._id && window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: u._id } }))}
                              >
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                    {(u.name || '?')[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium text-gray-800">{u.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                              ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                              {u.role === 'admin' ? '管理员' : '用户'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-500">{u.footprintCount}</td>
                          <td className="px-6 py-3">
                            {u.isOnline ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <Wifi className="w-3 h-3" /> 在线
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                <WifiOff className="w-3 h-3" /> 离线
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-400">
                            {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="px-6 py-3">
                            {editingId === u._id ? (
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  value={editPassword}
                                  onChange={(e) => setEditPassword(e.target.value)}
                                  placeholder="新密码(可选)"
                                  className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                                />
                                <button
                                  onClick={() => handleSaveEdit(u._id)}
                                  disabled={saving}
                                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1.5 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : u.role !== 'admin' ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => handleEdit(u)}
                                  className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                                  title="编辑"
                                >
                                  <PencilLine className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleKick(u._id, u.name)}
                                  className="p-1.5 hover:bg-orange-50 text-orange-500 rounded-lg transition-colors"
                                  title="踢出"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(u._id, u.name)}
                                  className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status message */}
        {actionMsg && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl shadow-lg z-10">
            {actionMsg}
          </div>
        )}
      </div>
    </div>
  );
}
