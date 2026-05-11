import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Clock, Image, Bell, Users, User, Shield, Menu, X } from 'lucide-react';

export default function MobileActionDrawer({
  user, isAdmin, unreadCount, friendUnreadCount,
  onCheckIn, onTimeline, onPhotoWall, onProfile,
  onBell, onFriends, onOpenAdmin, onOpenLogin, onOpenRegister,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close when tapping outside the panel (map area)
  const handlePointerDown = useCallback((e) => {
    if (open && panelRef.current && !panelRef.current.contains(e.target)) {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [handlePointerDown]);

  const itemClass = "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]";

  const closeAnd = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="md:hidden fixed z-[1000] transform-gpu will-change-transform"
      style={{ right: `max(12px, env(safe-area-inset-right))`, top: `max(14px, env(safe-area-inset-top))` }}>

      {/* ── FAB hamburger button ─────────────────────────── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center
            bg-[#121212]/50 backdrop-blur-xl
            border border-white/10
            shadow-xl
            active:scale-90 transition-transform duration-200"
        >
          <Menu className="w-4 h-4 text-white" />
        </button>
      )}

      {/* ── Dropdown panel — floats below FAB, map stays visible */}
      <div
        ref={panelRef}
        className={`absolute top-12 right-0 w-56 max-h-[60vh]
          rounded-2xl
          bg-[#121212]/70 backdrop-blur-2xl
          border border-white/10
          shadow-[0_8px_40px_rgba(0,0,0,0.5)]
          flex flex-col
          transition-all duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]
          ${open
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none overflow-hidden'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
          style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
          <span className="text-white/40 text-xs font-medium tracking-wider uppercase">菜单</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center
              hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        <div className="h-px bg-white/[0.06] mx-4 mb-2 flex-shrink-0" />

        {/* Scrollable menu items */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>

          {/* Check-in — accent highlight */}
          <button
            type="button"
            onClick={closeAnd(onCheckIn)}
            className={`${itemClass} text-blue-300`}
            style={{ background: 'rgba(59,130,246,0.10)' }}
          >
            <MapPin className="w-5 h-5 text-blue-400" />
            打卡
          </button>

          {/* Timeline */}
          <button
            type="button"
            onClick={closeAnd(onTimeline)}
            className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}
          >
            <Clock className="w-5 h-5 text-teal-400" />
            足迹记录
          </button>

          {/* Photo Wall */}
          <button
            type="button"
            onClick={closeAnd(onPhotoWall)}
            className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}
          >
            <Image className="w-5 h-5 text-purple-400" />
            照片墙
          </button>

          {/* Friends */}
          {user && (
            <button
              type="button"
              onClick={closeAnd(onFriends)}
              className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06] relative`}
            >
              <Users className="w-5 h-5 text-indigo-400" />
              我的好友
              {friendUnreadCount > 0 && (
                <span className="ml-auto min-w-[20px] h-[20px] flex items-center justify-center
                  bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">
                  {friendUnreadCount > 99 ? '99+' : friendUnreadCount}
                </span>
              )}
            </button>
          )}

          {/* Notifications */}
          {user && (
            <button
              type="button"
              onClick={closeAnd(onBell)}
              className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06] relative`}
            >
              <Bell className="w-5 h-5 text-amber-400" />
              通知
              {unreadCount > 0 && (
                <span className="ml-auto min-w-[20px] h-[20px] flex items-center justify-center
                  bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Profile */}
          {user ? (
            <button
              type="button"
              onClick={closeAnd(() => onProfile(user._id))}
              className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} className="w-5 h-5 rounded-full object-cover ring-1 ring-white/20" alt="" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-bold">
                  {(user.name || '?')[0]}
                </div>
              )}
              我的主页
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeAnd(onOpenLogin)}
                className={`${itemClass} text-white/80`}
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <User className="w-5 h-5 text-white/60" />
                登录
              </button>
              <button
                type="button"
                onClick={closeAnd(onOpenRegister)}
                className={`${itemClass} text-white/50 hover:bg-white/[0.03] active:bg-white/[0.06]`}
              >
                注册
              </button>
            </>
          )}

          {/* Admin */}
          {isAdmin && (
            <button
              type="button"
              onClick={closeAnd(onOpenAdmin)}
              className={`${itemClass} text-amber-200`}
              style={{ background: 'rgba(245,158,11,0.10)' }}
            >
              <Shield className="w-5 h-5 text-amber-400" />
              后台管理
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
