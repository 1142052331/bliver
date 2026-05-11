import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Users, Shield, Trash2, Zap, RefreshCw, Wifi, WifiOff, Check, PencilLine, Crosshair, AlertTriangle, Radio, UserX, Eye, Activity, Pause, Play, LogIn, UserPlus, MapPin, MessageCircle, Heart, UserX as UserXIcon, Trash2 as TrashIcon, Edit3, ZapOff, Wifi as WifiIcon, WifiOff as WifiOffIcon } from 'lucide-react';
import api from '../api';
import useUIStore from '../store/useUIStore';

const MAX_AUDIT_LOGS = 200;

const AUDIT_ICONS = {
  login: LogIn, register: UserPlus, checkin: MapPin,
  comment: MessageCircle, reaction: Heart,
  kick: ZapOff, delete: TrashIcon, user_edit: Edit3,
  connect: WifiIcon, disconnect: WifiOffIcon,
  footprint_delete: TrashIcon,
};

const AUDIT_COLORS = {
  login: 'text-emerald-400', register: 'text-emerald-400', checkin: 'text-emerald-400',
  comment: 'text-blue-400', reaction: 'text-pink-400',
  kick: 'text-orange-400', delete: 'text-red-400', user_edit: 'text-orange-400', footprint_delete: 'text-red-400',
  connect: 'text-gray-500', disconnect: 'text-gray-600',
};

function auditSummary(e) {
  switch (e.type) {
    case 'login': return `${e.user} 登录了 (IP: ${e.ip || 'N/A'})`;
    case 'register': return `${e.user} 注册了新账号 (IP: ${e.ip || 'N/A'})`;
    case 'checkin': return `${e.user} 在 ${e.placeName || '未知地点'} ${e.mood || ''} 打卡`;
    case 'comment': return `${e.user} 评论: "${e.content || ''}"`;
    case 'reaction': return `${e.user} ${e.emoji} 表态了`;
    case 'kick': return `${e.actor} 踢出了 ${e.target}`;
    case 'delete': return `${e.actor} 删除了用户 ${e.target}`;
    case 'user_edit': return `${e.actor} 编辑了用户 ${e.target}`;
    case 'footprint_delete': return `${e.actor} 删除了一条足迹`;
    case 'connect': return `${e.user} 上线了`;
    case 'disconnect': return `${e.user} 离线了`;
    default: return e.type || '未知事件';
  }
}

export default function AdminPanel({ onClose, socketRef }) {
  const [tab, setTab] = useState('users'); // 'online' | 'users' | 'clones' | 'audit'
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPaused, setAuditPaused] = useState(false);
  const auditEndRef = useRef(null);
  const auditBufferRef = useRef([]);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const msgTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(msgTimerRef.current), []);

  // Clone detection state
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneData, setCloneData] = useState(null);

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

  // ── Audit socket listener ──
  useEffect(() => {
    const sock = socketRef?.current;
    if (!sock) return;

    const handler = (event) => {
      if (auditBufferRef.current) {
        auditBufferRef.current.push({ ...event, id: Date.now() + '_' + Math.random().toString(36).slice(2, 7) });
      } else {
        setAuditLogs((prev) => {
          const next = [{ ...event, id: Date.now() + '_' + Math.random().toString(36).slice(2, 7) }, ...prev];
          return next.slice(0, MAX_AUDIT_LOGS);
        });
      }
    };

    sock.on('admin:audit', handler);
    return () => { sock.off('admin:audit', handler); };
  }, [socketRef]);

  // Flush buffered audit logs when not paused
  useEffect(() => {
    if (!auditPaused && auditBufferRef.current.length > 0) {
      setAuditLogs((prev) => {
        const next = [...auditBufferRef.current, ...prev];
        auditBufferRef.current = [];
        return next.slice(0, MAX_AUDIT_LOGS);
      });
    }
  }, [auditPaused]);

  // Auto-scroll to bottom of audit log
  useEffect(() => {
    if (!auditPaused && tab === 'audit') {
      auditEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [auditLogs.length, auditPaused, tab]);

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

  const handleFindClones = async () => {
    setCloneLoading(true);
    setCloneData(null);
    try {
      const res = await api.get('/api/admin/clones');
      setCloneData(res.data);
      setTab('clones');
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    }
    setCloneLoading(false);
  };

  const viewProfile = (userId) => {
    if (userId) window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId } }));
  };

  const tabClass = (t) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-red-500 text-red-400'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`;

  const cloneTabClass = (t) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-orange-500 text-orange-400'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white tracking-tight">后台管理</h2>
              <p className="text-[10px] text-gray-600 font-mono tracking-wider">ADMIN CONSOLE // SECURE CHANNEL</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Clone Detection Button */}
            <button
              onClick={handleFindClones}
              disabled={cloneLoading}
              className="relative px-3 py-1.5 text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 hover:border-orange-500/40 transition-all disabled:opacity-50 group overflow-hidden"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/10 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative inline-flex items-center gap-1.5">
                {cloneLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Crosshair className="w-3.5 h-3.5" />
                )}
                侦测关联账号
              </span>
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-300" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-6 gap-1">
          <button onClick={() => setTab('online')} className={tabClass('online')}>
            <Radio className="w-3.5 h-3.5 inline mr-1.5" />
            在线人员 ({onlineUsers.length})
          </button>
          <button onClick={() => setTab('users')} className={tabClass('users')}>
            <Users className="w-3.5 h-3.5 inline mr-1.5" />
            所有用户 ({allUsers.length})
          </button>
          {cloneData && (
            <button onClick={() => setTab('clones')} className={cloneTabClass('clones')}>
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              风控报告 ({cloneData.groups.length})
            </button>
          )}
          <button onClick={() => setTab('audit')} className={tabClass('audit')}>
            <Activity className="w-3.5 h-3.5 inline mr-1.5" />
            审计日志 ({auditLogs.length})
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
              <p className="text-xs text-gray-600 font-mono">LOADING...</p>
            </div>
          ) : (
            <>
              {/* ── ONLINE USERS TAB ── */}
              {tab === 'online' && (
                <div className="p-6">
                  {onlineUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                        <WifiOff className="w-5 h-5 text-gray-600" />
                      </div>
                      <p className="text-sm text-gray-500">暂无在线用户</p>
                      <p className="text-xs text-gray-600 mt-1 font-mono">NO ACTIVE CONNECTIONS</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {onlineUsers.map((u) => (
                        <div
                          key={u.socketId}
                          className="flex items-center justify-between p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all group"
                        >
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                            onClick={() => viewProfile(u.userId)}
                          >
                            <div className="relative shrink-0">
                              {u.avatarUrl ? (
                                <img
                                  src={u.avatarUrl}
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
                  )}
                </div>
              )}

              {/* ── ALL USERS TAB ── */}
              {tab === 'users' && (
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
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-white/10 bg-white/5 text-gray-200 rounded focus:outline-none focus:border-blue-400"
                              />
                            ) : (
                              <div
                                className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => viewProfile(u._id)}
                              >
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-blue-500/60 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-blue-500/30">
                                    {(u.name || '?')[0].toUpperCase()}
                                  </div>
                                )}
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
                                  onChange={(e) => setEditPassword(e.target.value)}
                                  placeholder="新密码(可选)"
                                  className="w-24 px-2 py-1 text-xs border border-white/10 bg-white/5 text-gray-200 rounded focus:outline-none focus:border-blue-400 placeholder:text-gray-500"
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
                                  className="p-1.5 bg-white/10 text-gray-300 rounded-lg hover:bg-white/15 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : u.role !== 'admin' ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => { useUIStore.getState().enterGhostMode(u._id, u.name); onClose(); }}
                                  className="p-1.5 hover:bg-amber-500/10 text-amber-400 rounded-lg transition-colors"
                                  title="切换视角"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleEdit(u)}
                                  className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                  title="编辑"
                                >
                                  <PencilLine className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleKick(u._id, u.name)}
                                  className="p-1.5 hover:bg-orange-500/10 text-orange-400 rounded-lg transition-colors"
                                  title="踢出"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(u._id, u.name)}
                                  className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => { useUIStore.getState().enterGhostMode(u._id, u.name); onClose(); }}
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
              )}

              {/* ── CLONE DETECTION TAB ── */}
              {tab === 'clones' && cloneData && (
                <div className="p-6 space-y-6">
                  {/* Summary Banner */}
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-red-500/5 via-orange-500/5 to-red-500/5 border border-red-500/10">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-red-300 tracking-wide">
                        风控雷达扫描完成
                      </h3>
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
                      {cloneData.groups.map((group, gi) => {
                        const sorted = [...group.users].sort(
                          (a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0)
                        );
                        return (
                        <div
                          key={gi}
                          className="rounded-xl border border-red-500/20 bg-black/40 overflow-hidden hover:border-red-500/40 transition-all"
                        >
                          {/* Group Header */}
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

                          {/* Accounts Table */}
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
                                    onClick={() => viewProfile(u._id)}
                                  >
                                    <td className="px-5 py-2.5">
                                      <div className="flex items-center gap-2.5">
                                        {u.avatarUrl ? (
                                          <img src={u.avatarUrl} className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10" />
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
                                      <span className="text-[11px] text-gray-500 font-mono">
                                        {u.registerIp || 'N/A'}
                                      </span>
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
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* ── AUDIT LOG TAB ── */}
              {tab === 'audit' && (
                <div className="flex flex-col h-full">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-[10px] text-gray-500 font-mono tracking-wider">
                      LIVE STREAM — {auditLogs.length} / {MAX_AUDIT_LOGS} events
                    </span>
                    <button
                      onClick={() => {
                        if (auditPaused) {
                          setAuditPaused(false);
                        } else {
                          setAuditPaused(true);
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                        auditPaused
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      {auditPaused ? (
                        <><Play className="w-3 h-3" /> 继续</>
                      ) : (
                        <><Pause className="w-3 h-3" /> 暂停</>
                      )}
                    </button>
                  </div>

                  {/* Log List */}
                  <div className="overflow-y-auto flex-1 max-h-[60vh]">
                    {auditLogs.length === 0 ? (
                      <div className="text-center py-16">
                        <Activity className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">等待审计事件...</p>
                        <p className="text-xs text-gray-600 mt-1 font-mono">AWAITING EVENTS</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.03]">
                        {auditLogs.map((entry) => {
                          const Icon = AUDIT_ICONS[entry.type] || Activity;
                          const color = AUDIT_COLORS[entry.type] || 'text-gray-400';
                          return (
                            <div key={entry.id} className="flex items-start gap-3 px-5 py-2 hover:bg-white/[0.02] transition-colors">
                              <div className={`shrink-0 mt-0.5 ${color}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-300 truncate">
                                  {auditSummary(entry)}
                                </p>
                              </div>
                              <span className="shrink-0 text-[9px] text-gray-600 font-mono mt-0.5">
                                {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                              </span>
                            </div>
                          );
                        })}
                        <div ref={auditEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status toast */}
        {actionMsg && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl shadow-lg z-10 border border-white/10">
            {actionMsg}
          </div>
        )}
      </div>
    </div>
  );
}
