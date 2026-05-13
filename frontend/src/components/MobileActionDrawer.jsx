import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Clock, Image, Bell, Users, User, Shield, Menu, X } from 'lucide-react';
import useUIStore from '../store/useUIStore';

export default function MobileActionDrawer({
  user, isAdmin, unreadCount, friendUnreadCount, onCheckIn,
}) {
  const { openTimeline, openPhotoWall, toggleNotifs, openFriends, openAdmin, openAuth, openProfile } = useUIStore();
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

  const itemClass = "ios-list-row w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[18px] text-sm font-semibold transition-all active:scale-[0.97]";

  const closeAnd = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="md:hidden fixed z-[1000] transform-gpu will-change-transform"
      style={{ right: `max(12px, env(safe-area-inset-right))`, top: `max(14px, env(safe-area-inset-top))` }}>

      {/* ── FAB hamburger button ─────────────────────────── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ios-island w-11 h-11 flex items-center justify-center
            active:scale-90 transition-transform duration-200"
        >
          <Menu className="w-4 h-4 text-white" />
        </button>
      )}

      {/* ── Dropdown panel — floats below FAB, map stays visible */}
      <div
        ref={panelRef}
        className={`fixed top-14 right-0 w-56 max-h-[calc(100dvh-90px)]
          ios-panel
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
            className="ios-icon-button w-8 h-8 min-w-8"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        <div className="h-px bg-white/[0.08] mx-4 mb-2 flex-shrink-0" />

        {/* Scrollable menu items */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>

          {/* Check-in — accent highlight */}
          <button
            type="button"
            onClick={closeAnd(onCheckIn)}
            className={`${itemClass} text-sky-200`}
            style={{ background: 'rgba(100,210,255,0.14)' }}
          >
            <MapPin className="w-5 h-5 text-blue-400" />
            打卡
          </button>

          {/* Timeline */}
          <button
            type="button"
            onClick={closeAnd(openTimeline)}
            className={`${itemClass} text-white/78`}
          >
            <Clock className="w-5 h-5 text-teal-400" />
            足迹记录
          </button>

          {/* Photo Wall */}
          <button
            type="button"
            onClick={closeAnd(openPhotoWall)}
            className={`${itemClass} text-white/78`}
          >
            <Image className="w-5 h-5 text-purple-400" />
            照片墙
          </button>

          {/* Friends */}
          {user && (
            <button
              type="button"
              onClick={closeAnd(openFriends)}
              className={`${itemClass} text-white/78 relative`}
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
              onClick={closeAnd(toggleNotifs)}
              className={`${itemClass} text-white/78 relative`}
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
              onClick={closeAnd(() => openProfile(user._id))}
              className={`${itemClass} text-white/78`}
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
                onClick={closeAnd(() => openAuth('login', ''))}
                className={`${itemClass} text-white/88`}
                style={{ background: 'rgba(255,255,255,0.12)' }}
              >
                <User className="w-5 h-5 text-white/60" />
                登录
              </button>
              <button
                type="button"
                onClick={closeAnd(() => openAuth('register', ''))}
                className={`${itemClass} text-white/58`}
              >
                注册
              </button>
            </>
          )}

          {/* Admin */}
          {isAdmin && (
            <button
              type="button"
              onClick={closeAnd(openAdmin)}
              className={`${itemClass} text-amber-100`}
              style={{ background: 'rgba(255,214,10,0.14)' }}
            >
              <Shield className="w-5 h-5 text-amber-400" />
              后台管理
            </button>
          )}
        </div>

        {/* 底部渐变收口 */}
        <div className="flex-shrink-0 h-8 pointer-events-none rounded-b-[24px]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(16,19,26,0.94) 100%)' }} />
      </div>
    </div>
  );
}
