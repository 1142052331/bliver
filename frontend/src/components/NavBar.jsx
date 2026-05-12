import { MapPin, LogOut, Bell, Megaphone, Users, Shield, LogIn, UserPlus } from 'lucide-react';
import useUIStore from '../store/useUIStore';

export default function NavBar({ onlineCount, user, onLogout, unreadCount, announceHasUnread, friendUnreadCount, isAdmin, onCheckIn }) {
  const { toggleNotifs, openAnnouncements, openFriends, openAdmin, openAuth, openAbout } = useUIStore();
  return (
    <nav className="absolute z-[1000] hidden md:flex items-center justify-between
      px-4 py-2.5 aurora-glass rounded-2xl transform-gpu will-change-transform"
      style={{ fontFamily: 'var(--font-body)', top: `max(12px, env(safe-area-inset-top))`, left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))' }}>
      {/* Logo + Check In */}
      <div className="flex items-center gap-2">
        <button
          onClick={openAbout}
          className="relative w-9 h-9 rounded-xl aurora-btn flex items-center justify-center
            shadow-lg hover:scale-110 transition-transform duration-300 cursor-pointer"
          title="关于 Bliver"
          style={{ boxShadow: '0 4px 20px var(--aurora-glow-teal), 0 0 40px var(--aurora-glow-purple)' }}>
          <MapPin className="w-4 h-4 text-white" />
        </button>
        <span className="font-bold text-lg tracking-tight text-white/90">Bliver</span>
        <button
          onClick={onCheckIn}
          className="aurora-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white
            flex items-center gap-1 shadow-md ml-1"
        >
          <MapPin className="w-3 h-3" />
          打卡
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Online count */}
        <div className="flex items-center gap-1.5 text-xs
          bg-white/[0.03] border border-white/[0.06] rounded-full pl-2 pr-3 py-1"
          title={`${onlineCount} 位用户在线`}>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.6)] animate-pulse" />
          <span className="font-semibold text-white/80">{onlineCount}</span>
          <span className="text-white/30">在线</span>
        </div>

        {/* Announcements */}
        {user && (
          <button onClick={openAnnouncements}
            className="relative p-2 hover:bg-white/[0.04] rounded-xl transition-all duration-200 text-white/50 hover:text-white/80">
            <Megaphone className="w-4 h-4" />
            {announceHasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400
                shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            )}
          </button>
        )}

        {/* Friends */}
        {user && (
          <button onClick={openFriends}
            className="relative p-2 hover:bg-white/[0.04] rounded-xl transition-all duration-200 text-white/50 hover:text-white/80">
            <Users className="w-4 h-4" />
            {friendUnreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center
                bg-red-500 text-white text-[9px] font-bold rounded-full
                shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                {friendUnreadCount > 99 ? '99+' : friendUnreadCount}
              </span>
            )}
          </button>
        )}

        {/* Bell */}
        {user && (
          <button onClick={toggleNotifs}
            className="relative p-2 hover:bg-white/[0.04] rounded-xl transition-all duration-200 text-white/50 hover:text-white/80">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[16px] h-[16px] flex items-center justify-center
                bg-gradient-to-r from-rose-400 to-pink-500 text-white text-[9px] font-bold
                rounded-full shadow-[0_0_10px_rgba(236,72,153,0.4)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Admin */}
        {isAdmin && (
          <button onClick={openAdmin}
            className="flex items-center gap-1 px-3 py-1.5 aurora-warm text-white text-xs font-semibold
              rounded-xl shadow-[0_4px_15px_rgba(245,158,11,0.2)] transition-all hover:scale-[1.02]"
            style={{ background: 'var(--aurora-warm)' }}>
            <Shield className="w-3 h-3" />
            后台
          </button>
        )}

        {user ? (
          <>
            <span className="cursor-pointer"
              onClick={() => useUIStore.getState().openProfile(user._id)}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-teal-400/30
                    hover:ring-teal-400/60 transition-all duration-200"
                  onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
              ) : (
                <div className="w-8 h-8 rounded-full aurora-btn flex items-center justify-center
                  text-white text-xs font-bold ring-2 ring-teal-400/30 hover:ring-teal-400/60 transition-all duration-200">
                  {user?.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </span>

            <button onClick={onLogout}
              className="p-2 hover:bg-white/[0.04] rounded-xl transition-all duration-200 text-white/30 hover:text-white/60"
              title="退出">
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => openAuth('login', '')}
              className="aurora-btn px-3.5 py-1.5 text-white text-xs font-semibold rounded-xl
                flex items-center gap-1">
              <LogIn className="w-3 h-3" />
              登录
            </button>
            <button onClick={() => openAuth('register', '')}
              className="aurora-btn-glass px-3.5 py-1.5 text-white/70 text-xs font-semibold rounded-xl
                flex items-center gap-1">
              <UserPlus className="w-3 h-3" />
              注册
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
