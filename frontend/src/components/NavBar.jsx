import { MapPin, Users, LogOut, Bell, Shield, LogIn, UserPlus } from 'lucide-react';

export default function NavBar({ onlineCount, user, onLogout, unreadCount, onBellClick, isAdmin, onOpenAdmin, onOpenLogin, onOpenRegister }) {
  return (
    <nav className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between
      px-4 py-2.5 rounded-2xl
      bg-white/70 backdrop-blur-xl border border-white/80
      shadow-lg shadow-black/[0.03]">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600
          flex items-center justify-center shadow-md shadow-indigo-500/20">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-base tracking-tight text-gray-800">Bliver</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Online count */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100/80 rounded-full pl-2 pr-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-gray-700">{onlineCount}</span>
          <span className="text-gray-400">在线</span>
        </div>

        {/* Bell */}
        {user && (
          <button
            onClick={onBellClick}
            className="relative p-2 hover:bg-gray-100/80 rounded-xl transition-all duration-200"
          >
            <Bell className="w-4 h-4 text-gray-500" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[16px] h-[16px] flex items-center justify-center
                bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold
                rounded-full shadow-sm shadow-red-500/20">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-red-500 to-rose-500
              text-white text-xs font-semibold rounded-xl hover:from-red-600 hover:to-rose-600
              transition-all shadow-md shadow-red-500/20"
          >
            <Shield className="w-3.5 h-3.5" />
            后台
          </button>
        )}

        {user ? (
          <>
            <span
              className="cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }))}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-200
                    hover:ring-indigo-400 transition-all duration-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500
                  flex items-center justify-center text-white text-xs font-bold
                  ring-2 ring-indigo-200 hover:ring-indigo-400 transition-all duration-200">
                  {user?.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </span>

            <button
              onClick={onLogout}
              className="p-2 hover:bg-gray-100/80 rounded-xl transition-all duration-200"
              title="退出"
            >
              <LogOut className="w-4 h-4 text-gray-400" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onOpenLogin}
              className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600
                text-white text-xs font-semibold rounded-xl
                hover:from-indigo-600 hover:to-purple-700
                transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              登录
            </button>
            <button
              onClick={onOpenRegister}
              className="px-3.5 py-1.5 bg-white/80 backdrop-blur text-gray-700 text-xs font-semibold
                rounded-xl border border-gray-200 hover:border-indigo-300 hover:text-indigo-600
                transition-all flex items-center gap-1"
            >
              <UserPlus className="w-3.5 h-3.5" />
              注册
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
