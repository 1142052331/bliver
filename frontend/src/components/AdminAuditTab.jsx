import { useState, useEffect, useCallback } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { apiClient } from '../api';

const AUDIT_ICONS = {
  login: Activity,
  register: Activity,
  delete: Activity,
  footprint_delete: Activity,
  kick: Activity,
  user_edit: Activity,
};

const AUDIT_COLORS = {
  login: 'text-blue-400',
  register: 'text-purple-400',
  delete: 'text-red-400',
  footprint_delete: 'text-red-400',
  kick: 'text-orange-400',
  user_edit: 'text-blue-400',
};

function auditSummary(entry) {
  switch (entry.type) {
    case 'login': return `${entry.actor || '?'} 登录 — IP: ${entry.ip || 'N/A'}`;
    case 'register': return `${entry.actor || '?'} 注册 — IP: ${entry.ip || 'N/A'}`;
    case 'delete': return `${entry.actor} 删除了用户 ${entry.target}`;
    case 'footprint_delete': return `${entry.actor} 删除了足迹 ${entry.detail?.slice(-6) || ''}`;
    case 'kick': return `${entry.actor} 踢出了 ${entry.target}`;
    case 'user_edit': return `${entry.actor} 编辑了用户 ${entry.target}`;
    default: return `${entry.type}: ${entry.actor || '?'}`;
  }
}

export default function AdminAuditTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const fetchLogs = useCallback(async (beforeId) => {
    setLoading(true);
    try {
      const res = await apiClient.admin.audit({ limit: 50, before: beforeId });
      const docs = res.data.logs || [];
      if (beforeId) {
        setLogs(prev => [...prev, ...docs]);
      } else {
        setLogs(docs);
      }
      setHasMore(docs.length === 50);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = () => fetchLogs();
  const handleLoadMore = () => {
    const last = logs[logs.length - 1];
    if (last) fetchLogs(last._id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-white/[0.02]">
        <span className="text-[10px] text-gray-500 font-mono tracking-wider">
          审计日志 · 最近 6 类事件
        </span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-white rounded border border-white/10 hover:border-white/20 transition-colors disabled:opacity-30"
        >
          {loading ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> 加载</>
          ) : (
            <><RefreshCw className="w-3 h-3" /> 刷新</>
          )}
        </button>
      </div>

      <div className="overflow-y-auto flex-1 max-h-[60vh]">
        {logs.length === 0 && !loading ? (
          <div className="text-center py-16">
            <Activity className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">暂无审计记录</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {logs.map((entry) => {
              const Icon = AUDIT_ICONS[entry.type] || Activity;
              const color = AUDIT_COLORS[entry.type] || 'text-gray-400';
              return (
                <div key={entry._id} className="flex items-start gap-3 px-5 py-2 hover:bg-white/[0.02] transition-colors">
                  <div className={`shrink-0 mt-0.5 ${color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-300 truncate">{auditSummary(entry)}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-gray-600 font-mono mt-0.5">
                    {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                </div>
              );
            })}
            {hasMore && (
              <div className="text-center py-4">
                <button onClick={handleLoadMore} disabled={loading}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30">
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
