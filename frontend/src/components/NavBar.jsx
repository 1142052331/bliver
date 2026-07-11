// @feature 顶部导航栏 | Top Navigation Bar | NavBar
import { MapPin, LogOut, Bell, Megaphone, Users, Shield, LogIn, UserPlus, MessageSquare } from 'lucide-react';
import useUIStore from '../store/useUIStore';

export default function NavBar({ onlineCount, user, onLogout, unreadCount, announceHasUnread, friendUnreadCount, isAdmin, onCheckIn }) {
  const { toggleNotifs, openAnnouncements, openFriends, openAdmin, openAuth, openAbout, openFeedback } = useUIStore();
  return (
    <nav className="bliver-desktop-nav absolute z-[1000] hidden md:flex items-center justify-between
      transform-gpu will-change-transform"
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
          className="bliver-desktop-nav__brand-mark"
          aria-label="关于 Bliver"
          title="关于 Bliver"
        >
          <MapPin className="w-4 h-4" />
        </button>
        <span className="bliver-desktop-nav__brand">Bliver</span>
        <button
          onClick={onCheckIn}
          className="bliver-desktop-nav__publish"
        >
          <MapPin className="w-3 h-3" />
          打卡
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Online count */}
        <div className="bliver-desktop-nav__online"
          title={`${onlineCount} 位用户在线`}>
          <span className="bliver-desktop-nav__online-dot" />
          <span className="font-semibold">{onlineCount}</span>
          <span className="bliver-desktop-nav__online-label">在线</span>
        </div>

        {/* Announcements */}
        {user && (
          <button onClick={openAnnouncements}
            className="bliver-desktop-nav__icon relative">
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
            className="bliver-desktop-nav__icon relative">
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
            className="bliver-desktop-nav__icon relative">
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
            className="bliver-desktop-nav__icon"
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
              className="bliver-desktop-nav__icon"
              title="退出">
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => openAuth('login', '')}
              className="bliver-desktop-nav__auth bliver-desktop-nav__auth--primary">
              <LogIn className="w-3 h-3" />
              登录
            </button>
            <button onClick={() => openAuth('register', '')}
              className="bliver-desktop-nav__auth">
              <UserPlus className="w-3 h-3" />
              注册
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
