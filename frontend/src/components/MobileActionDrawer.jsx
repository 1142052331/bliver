import { useState, useEffect, useRef } from 'react';
import { MapPin, Clock, Image, Bell, User, Shield, Menu, X } from 'lucide-react';

export default function MobileActionDrawer({
  user, isAdmin, unreadCount,
  onCheckIn, onTimeline, onPhotoWall, onProfile,
  onBell, onOpenAdmin, onOpenLogin, onOpenRegister,
}) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const itemClass = "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]";

  return (
    <div className="md:hidden fixed z-[1200]"
      style={{ right: `max(0px, env(safe-area-inset-right))`, top: '50%', transform: 'translateY(-50%)' }}
      ref={drawerRef}>

      {/* ── Circular FAB (hamburger) ──────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center
            bg-[#121212]/50 backdrop-blur-xl
            border border-white/10
            shadow-xl pointer-events-auto
            active:scale-90 transition-transform duration-200"
        >
          <Menu className="w-5 h-5 text-white" />
        </button>
      )}

      {/* ── Drawer Panel ──────────────────────────────────── */}
      <div className={`fixed inset-0 z-[1250] transition-opacity duration-300 overflow-hidden
        ${open ? 'pointer-events-auto' : 'pointer-events-none opacity-0'}`}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)} />

        {/* Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-64 max-w-[80vw] flex flex-col
            transition-transform duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)]
            border-l border-white/10
            ${open ? 'translate-x-0' : 'translate-x-full'}`}
          style={{
            background: 'rgba(28,28,30,0.75)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3"
            style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
            <span className="text-white/50 text-xs font-medium tracking-wider uppercase">菜单</span>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center
                hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
            >
              <X className="w-4 h-4 text-white/50" />
            </button>
          </div>

          <div className="h-px bg-white/[0.06] mx-4 mb-2" />

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">

            {/* 打卡 — 强调按钮 */}
            <button onClick={() => { onCheckIn(); setOpen(false); }}
              className={`${itemClass} text-blue-300 active:bg-white/[0.04]`}
              style={{ background: 'rgba(59,130,246,0.10)' }}>
              <MapPin className="w-5 h-5 text-blue-400" />
              打卡
            </button>

            {/* 足迹记录 */}
            <button onClick={() => { onTimeline(); setOpen(false); }}
              className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}>
              <Clock className="w-5 h-5 text-teal-400" />
              足迹记录
            </button>

            {/* 照片墙 */}
            <button onClick={() => { onPhotoWall(); setOpen(false); }}
              className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}>
              <Image className="w-5 h-5 text-purple-400" />
              照片墙
            </button>

            {/* 通知 */}
            {user && (
              <button onClick={() => { onBell(); setOpen(false); }}
                className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06] relative`}>
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

            {/* 我的主页 */}
            {user ? (
              <button onClick={() => { onProfile(user._id); setOpen(false); }}
                className={`${itemClass} text-white/70 hover:bg-white/[0.03] active:bg-white/[0.06]`}>
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
                <button onClick={() => { onOpenLogin(); setOpen(false); }}
                  className={`${itemClass} text-white/80 active:bg-white/[0.04]`}
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <User className="w-5 h-5 text-white/60" />
                  登录
                </button>
                <button onClick={() => { onOpenRegister(); setOpen(false); }}
                  className={`${itemClass} text-white/50 hover:bg-white/[0.03] active:bg-white/[0.06]`}>
                  注册
                </button>
              </>
            )}

            {/* 后台管理 */}
            {isAdmin && (
              <button onClick={() => { onOpenAdmin(); setOpen(false); }}
                className={`${itemClass} text-amber-200 active:bg-white/[0.04]`}
                style={{ background: 'rgba(245,158,11,0.10)' }}>
                <Shield className="w-5 h-5 text-amber-400" />
                后台管理
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
