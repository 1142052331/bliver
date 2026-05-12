import { Activity, Play, Pause } from 'lucide-react';

const MAX_AUDIT_LOGS = 200;

const AUDIT_ICONS = {
  login: Activity,
  register: Activity,
  checkin: Activity,
  reaction: Activity,
  comment: Activity,
  delete: Activity,
  footprint_delete: Activity,
  kick: Activity,
  user_edit: Activity,
  connect: Activity,
  disconnect: Activity,
};

const AUDIT_COLORS = {
  login: 'text-blue-400',
  register: 'text-purple-400',
  checkin: 'text-emerald-400',
  reaction: 'text-yellow-400',
  comment: 'text-cyan-400',
  delete: 'text-red-400',
  footprint_delete: 'text-red-400',
  kick: 'text-orange-400',
  user_edit: 'text-blue-400',
  connect: 'text-emerald-400',
  disconnect: 'text-gray-400',
};

function auditSummary(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
  switch (entry.type) {
    case 'login': return `${entry.user} 登录 — IP: ${entry.ip || 'N/A'}`;
    case 'register': return `${entry.user} 注册 — IP: ${entry.ip || 'N/A'}`;
    case 'checkin': return `${entry.user} 打卡 — ${entry.placeName || entry.mood || ''}`;
    case 'reaction': return `${entry.user} 表态 — ${entry.emoji}`;
    case 'comment': return `${entry.user} 评论 — ${entry.content?.slice(0, 50) || ''}`;
    case 'delete': return `${entry.actor} 删除了用户 ${entry.target}`;
    case 'footprint_delete': return `${entry.actor} 删除了足迹 ${entry.footprintId?.slice(-6)}`;
    case 'kick': return `${entry.actor} 踢出了 ${entry.target}`;
    case 'user_edit': return `${entry.actor} 编辑了用户 ${entry.target}`;
    case 'connect': return `${entry.user} 上线`;
    case 'disconnect': return `${entry.user} 离线`;
    default: return `${entry.type}: ${entry.user || entry.actor || ''}`;
  }
}

export default function AdminAuditTab({ auditLogs, auditPaused, onTogglePause, auditEndRef }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-white/[0.02]">
        <span className="text-[10px] text-gray-500 font-mono tracking-wider">
          LIVE STREAM — {auditLogs.length} / {MAX_AUDIT_LOGS} events
        </span>
        <button
          onClick={onTogglePause}
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
  );
}
