// @feature 管理员面板 | Admin Panel | AdminPanel
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Users, Shield, Trash2, Zap, RefreshCw, Wifi, WifiOff, Check, PencilLine, Crosshair, AlertTriangle, Radio, UserX, Eye, Activity, Pause, Play, LogIn, UserPlus, MapPin, MessageCircle, Heart, UserX as UserXIcon, Trash2 as TrashIcon, Edit3, ZapOff, Wifi as WifiIcon, WifiOff as WifiOffIcon, MessageSquare } from 'lucide-react';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';
import AdminOnlineTab from './AdminOnlineTab';
import AdminUsersTab from './AdminUsersTab';
import AdminClonesTab from './AdminClonesTab';
import AdminAuditTab from './AdminAuditTab';
import AdminFeedbackTab from './AdminFeedbackTab';
import AdminReportsTab from './admin/AdminReportsTab';

export default function AdminPanel({ onClose, socketRef }) {
  const [tab, setTab] = useState('users');
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

  // Clone detection state
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneData, setCloneData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [onlineRes, usersRes] = await Promise.all([
        apiClient.admin.online(),
        apiClient.admin.users(),
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
      await apiClient.admin.kick(userId);
      showMsg(`${name} 已被踢出`);
      fetchData();
    } catch (err) { showMsg(err.response?.data?.error || err.message); }
  };

  const handleDelete = async (userId, name) => {
    if (!confirm(`确认删除用户 ${name} 及其所有足迹？此操作不可逆！`)) return;
    try {
      await apiClient.admin.deleteUser(userId);
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
      await apiClient.admin.updateUser(userId, body);
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
      const res = await apiClient.admin.clones();
      setCloneData(res.data);
      setTab('clones');
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    }
    setCloneLoading(false);
  };

  const viewProfile = (userId) => {
    if (userId) useUIStore.getState().openProfile(userId);
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
            审计日志
          </button>
          <button onClick={() => setTab('feedback')} className={tabClass('feedback')}>
            <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
            反馈
          </button>
          <button onClick={() => setTab('reports')} className={tabClass('reports')}>
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
            举报
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
                <AdminOnlineTab onlineUsers={onlineUsers} onViewProfile={viewProfile} />
              )}

              {/* ── ALL USERS TAB ── */}
              {tab === 'users' && (
                <AdminUsersTab
                  allUsers={allUsers}
                  editingId={editingId} editName={editName} editPassword={editPassword} saving={saving}
                  onEditNameChange={(e) => setEditName(e.target.value)}
                  onEditPasswordChange={(e) => setEditPassword(e.target.value)}
                  onEdit={handleEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  onKick={handleKick}
                  onDelete={handleDelete}
                  onViewProfile={viewProfile}
                />
              )}

              {/* ── CLONE DETECTION TAB ── */}
              {tab === 'clones' && cloneData && (
                <AdminClonesTab cloneData={cloneData} onViewProfile={viewProfile} />
              )}
              {/* ── AUDIT LOG TAB ── */}
              {tab === 'audit' && (
                <AdminAuditTab />
              )}
              {/* ── FEEDBACK TAB ── */}
              {tab === 'feedback' && (
                <AdminFeedbackTab />
              )}
              {tab === 'reports' && (
                <AdminReportsTab />
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
