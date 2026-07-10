// @feature 足迹时间线 | Timeline Drawer | TimelineDrawer
import { useState, useRef, useEffect } from 'react';
import useUIStore from '../store/useUIStore';
import { groupFootprintsByUser } from '../utils/groupFootprints';
import { X, Clock, Trash2, Share2, Check } from 'lucide-react';
import ReactionPicker from './ReactionPicker';
import { useFootprintActionsContext } from '../contexts/FootprintActionsContext';
import useDialogFocusTrap from '../hooks/useDialogFocusTrap';

function UserTimeline({ user, items, userId, isAdmin, onSelectFootprint, onOpenProfile }) {
  const { handleReact: onReact, handleDelete: onDelete, handleShare: onShare } = useFootprintActionsContext();
  const timeStr = (date) =>
    new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const [copiedId, setCopiedId] = useState(null);
  const copyTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const handleCopy = (fpId) => {
    onShare(fpId);
    setCopiedId(fpId);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="mb-6">
      <div className="mb-3">
        <button
          type="button"
          disabled={!user?._id}
          aria-label={`查看 ${user?.name || 'Unknown'} 的个人主页`}
          className="group flex min-h-11 items-center gap-2 border-0 bg-transparent p-0 pl-1 text-left disabled:cursor-default"
          onClick={() => user?._id && onOpenProfile(user._id)}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-white/18 group-hover:ring-sky-300/55 transition-all" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
          ) : (
            <span className="w-8 h-8 rounded-full ios-primary flex items-center justify-center text-xs font-bold group-hover:ring-2 group-hover:ring-sky-300/55 transition-all">
              {(user?.name || '?')[0]}
            </span>
          )}
          <span className="font-semibold text-sm text-white/88 group-hover:text-sky-200">
            {user?.name || 'Unknown'}
          </span>
        </button>
      </div>

      <div className="relative border-l border-white/12 ml-[15px] pl-5 space-y-4">
        {items.map((fp) => {
          const copied = copiedId === fp._id;

          return (
            <div key={fp._id} className="relative">
              <div className="absolute -left-[calc(1.25rem+5px)] top-1 w-2.5 h-2.5 bg-sky-300 rounded-full ring-4 ring-[#10141c]/90" />
              <div className="flex items-center gap-1 text-xs text-white/38 mb-1">
                <Clock className="w-3 h-3" />
                {timeStr(fp.createdAt)}
              </div>
              <div
                className="ios-card p-3 cursor-pointer hover:border-sky-300/25 transition-all"
                onClick={() => onSelectFootprint && onSelectFootprint(fp._id)}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-white/88">
                    📍 {fp.placeName || 'Unknown'}
                  </p>
                  {fp.mood && (
                    <span className="text-lg leading-none">{fp.mood}</span>
                  )}
                </div>
                <p className="text-sm text-white/62">{fp.message}</p>
                {fp.photoUrl && (
                  <img src={fp.photoUrl} className="mt-2 w-full max-h-[160px] object-cover rounded-lg" />
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10"
                  onClick={(e) => e.stopPropagation()}>
                  <ReactionPicker fp={fp} userId={userId} onReact={onReact} />

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(fp._id)}
                      className="p-1.5 hover:bg-white/10 rounded-full"
                      title="Copy link"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5 text-white/45" />}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => onDelete(fp._id)}
                        className="p-1.5 hover:bg-red-400/10 rounded-full"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PERIODS = [
  { key: 'today', label: '本日' },
  { key: 'week', label: '本周' },
  { key: 'year', label: '本年' },
];

export default function TimelineDrawer({ isOpen, onClose, footprints, userId, isAdmin, onSelectFootprint, period, onChangePeriod, loading }) {
  const dialogRef = useRef(null);
  useDialogFocusTrap(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  const grouped = groupFootprintsByUser(footprints);
  const handleOpenProfile = (profileId) => {
    onClose();
    useUIStore.getState().openProfile(profileId);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="ios-backdrop fixed inset-0 z-[1500] opacity-100"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-drawer-title"
        tabIndex={-1}
        style={{ right: `max(0px, env(safe-area-inset-right))` }}
        className="ios-panel fixed top-0 h-dvh w-[380px] max-w-[88vw] z-[1600]
          flex flex-col"
      >
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 id="timeline-drawer-title" className="font-extrabold text-lg text-white/92">足迹记录</h2>
            <button
              type="button"
              aria-label="关闭足迹记录"
              onClick={onClose}
              className="ios-icon-button w-11 h-11 min-w-11 min-h-11"
            >
              <X className="w-4 h-4 text-white/55" />
            </button>
          </div>
          {/* Period pills */}
          <div className="ios-segment flex rounded-full p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onChangePeriod && onChangePeriod(p.key)}
                className={`flex-1 min-h-11 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                  ${period === p.key
                    ? 'ios-segment-active'
                    : 'text-white/45 hover:text-white/72'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 aurora-scroll">
          {loading ? (
            <div className="animate-pulse space-y-5">
              {[1,2,3].map(i => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white/10" />
                    <div className="h-4 w-20 bg-white/10 rounded" />
                  </div>
                  <div className="ml-4 pl-5 space-y-3 border-l border-white/10">
                    {[1,2].map(j => (
                      <div key={j} className="ios-card p-3 space-y-2">
                        <div className="h-3 w-12 bg-white/10 rounded" />
                        <div className="h-4 w-32 bg-white/10 rounded" />
                        <div className="h-4 w-full bg-white/8 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-white/38 text-sm text-center mt-12">暂无足迹记录</p>
          ) : (
            grouped.map(({ user, items }) => (
              <UserTimeline
                key={user?._id || 'unknown'}
                user={user}
                items={items}
                userId={userId}
                isAdmin={isAdmin}
                onSelectFootprint={onSelectFootprint}
                onOpenProfile={handleOpenProfile}
              />
            ))
          )}
        </div>

        {/* 底部渐变收口 */}
        <div className="flex-shrink-0 h-8 pointer-events-none rounded-b-[24px]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(16,19,26,0.94) 100%)' }} />
      </div>
    </>
  );
}
