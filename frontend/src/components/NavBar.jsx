// @feature 顶部导航栏 | Top Navigation Bar | NavBar
import { MapPin, LogOut, Bell, Megaphone, Users, Shield, LogIn, UserPlus, MessageSquare } from 'lucide-react';
import useUIStore from '../store/useUIStore';

export default function NavBar({ onlineCount, user, onLogout, unreadCount, announceHasUnread, friendUnreadCount, isAdmin, onCheckIn }) {
  const { toggleNotifs, openAnnouncements, openFriends, openAdmin, openAuth, openAbout, openFeedback } = useUIStore();
  return (
    <nav className="ios-glass absolute z-[1000] hidden md:flex items-center justify-between
      px-3.5 py-2.5 rounded-[28px] transform-gpu will-change-transform"
      style={{
        fontFamily: 'var(--font-body)',
        top: `max(12px, env(safe-area-inset-top))`,
        left: '50%',
        width: 'min(1120px, calc(100vw - 24px))',
        transform: 'translateX(-50%)',
      }}>
      {/* Logo + Check In */}
      <div className="flex items-center gap-2">
        <button
          onClick={openAbout}
          className="relative w-10 h-10 rounded-full ios-primary flex items-center justify-center
            hover:scale-[1.04] transition-transform duration-200 cursor-pointer"
          title="关于 Bliver"
        >
          <MapPin className="w-4 h-4 text-white" />
        </button>
        <span className="font-extrabold text-lg tracking-tight text-white/92">Bliver</span>
        <button
          onClick={onCheckIn}
          className="ios-primary px-3.5 py-1.5 text-xs ml-1"
        >
          <MapPin className="w-3 h-3" />
          打卡
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Online count */}
        <div className="ios-island flex items-center gap-1.5 text-xs pl-2.5 pr-3.5 py-1.5"
          title={`${onlineCount} 位用户在线`}>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.6)] animate-pulse" />
          <span className="font-semibold text-white/80">{onlineCount}</span>
          <span className="text-white/30">在线</span>
        </div>

        {/* Announcements */}
        {user && (
          <button onClick={openAnnouncements}
            className="ios-icon-button relative">
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
            className="ios-icon-button relative">
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
            className="ios-icon-button relative">
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

        {/* Feedback */}
        {user && (
          <button onClick={openFeedback}
            className="ios-icon-button"
            title="反馈建议">
            <MessageSquare className="w-4 h-4" />
          </button>
        )}

        {/* Admin */}
        {isAdmin && (
          <button onClick={openAdmin}
            className="flex items-center gap-1 px-3.5 py-2 text-white text-xs font-bold
              rounded-full shadow-[0_12px_28px_rgba(255,159,10,0.18)] transition-all hover:scale-[1.02]"
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
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20
                    hover:ring-sky-300/60 transition-all duration-200"
                  onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
              ) : (
                <div className="w-9 h-9 rounded-full ios-primary flex items-center justify-center
                  text-xs font-bold ring-2 ring-white/20 hover:ring-sky-300/60 transition-all duration-200">
                  {user?.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </span>

            <button onClick={onLogout}
              className="ios-icon-button"
              title="退出">
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => openAuth('login', '')}
              className="ios-primary px-3.5 py-2 text-xs">
              <LogIn className="w-3 h-3" />
              登录
            </button>
            <button onClick={() => openAuth('register', '')}
              className="aurora-btn-glass px-3.5 py-2 text-white/78 text-xs font-semibold rounded-full
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
