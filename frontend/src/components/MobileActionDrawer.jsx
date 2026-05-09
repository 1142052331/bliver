import { useState, useEffect, useRef } from 'react';
import { MapPin, Clock, Image, Bell, User, Shield, ChevronRight, ChevronLeft } from 'lucide-react';

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

  const btnClass = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.97]";

  return (
    <div className={`md:hidden fixed right-0 top-1/3 z-[1200] ${open ? '' : 'pointer-events-none'}`} ref={drawerRef}>
      {/* Pull tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2
            w-7 h-16 aurora-glass rounded-l-xl
            flex items-center justify-center
            shadow-lg shadow-black/20
            border border-white/10 border-r-0
            active:scale-95 transition-transform pointer-events-auto"
        >
          <ChevronLeft className="w-4 h-4 text-white/60" />
        </button>
      )}

      {/* Drawer panel */}
      <div className={`transition-transform duration-300 ease-in-out overflow-hidden
        ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
        <div className="aurora-glass rounded-l-2xl shadow-2xl shadow-black/30
          border border-white/10 border-r-0
          max-h-[70vh] overflow-y-auto aurora-scroll
          flex flex-col gap-1 p-3 pr-1 min-w-[180px]"
          style={{ background: 'var(--aurora-surface)' }}>

          {/* Close tab */}
          <button
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-white/40 text-xs
              hover:text-white/60 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            收起
          </button>

          {/* Divider */}
          <div className="h-px bg-white/[0.06] mx-3" />

          {/* Check In */}
          <button onClick={() => { onCheckIn(); setOpen(false); }} className={`${btnClass} aurora-btn text-white`}>
            <MapPin className="w-4 h-4" />
            打卡
          </button>

          {/* Journey */}
          <button onClick={() => { onTimeline(); setOpen(false); }} className={`${btnClass} text-white/70 hover:bg-white/[0.04]`}>
            <Clock className="w-4 h-4 text-teal-400" />
            今日记录
          </button>

          {/* Photo Wall */}
          <button onClick={() => { onPhotoWall(); setOpen(false); }} className={`${btnClass} text-white/70 hover:bg-white/[0.04]`}>
            <Image className="w-4 h-4 text-purple-400" />
            照片墙
          </button>

          {/* Notification */}
          {user && (
            <button onClick={() => { onBell(); setOpen(false); }} className={`${btnClass} text-white/70 hover:bg-white/[0.04] relative`}>
              <Bell className="w-4 h-4 text-amber-400" />
              通知
              {unreadCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center
                  bg-gradient-to-r from-rose-400 to-pink-500 text-white text-[10px] font-bold
                  rounded-full">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
          )}

          {/* Profile */}
          {user ? (
            <button onClick={() => { onProfile(user._id); setOpen(false); }} className={`${btnClass} text-white/70 hover:bg-white/[0.04]`}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} className="w-5 h-5 rounded-full object-cover ring-1 ring-teal-400/30" />
              ) : (
                <div className="w-5 h-5 rounded-full aurora-btn flex items-center justify-center text-white text-[10px] font-bold">
                  {(user.name || '?')[0]}
                </div>
              )}
              我的主页
            </button>
          ) : (
            <>
              <button onClick={() => { onOpenLogin(); setOpen(false); }} className={`${btnClass} aurora-btn text-white`}>
                <User className="w-4 h-4" />
                登录
              </button>
              <button onClick={() => { onOpenRegister(); setOpen(false); }} className={`${btnClass} text-white/70 hover:bg-white/[0.04] aurora-btn-glass`}>
                注册
              </button>
            </>
          )}

          {/* Admin */}
          {isAdmin && (
            <button onClick={() => { onOpenAdmin(); setOpen(false); }}
              className={`${btnClass} text-white/80 hover:bg-white/[0.04]`}
              style={{ background: 'var(--aurora-warm)' }}>
              <Shield className="w-4 h-4 text-white" />
              后台管理
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
