import { Link } from 'react-router-dom';
import { MapPin, Users, LogOut, Bell, Shield, LogIn, UserPlus } from 'lucide-react';

export default function NavBar({ onlineCount, user, onLogout, unreadCount, onBellClick, isAdmin, onOpenAdmin, onOpenLogin, onOpenRegister }) {
  return (
    <nav className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-5 py-3
      bg-white/75 backdrop-blur-md border-b border-gray-200/60 shadow-sm">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-blue-600" />
        <span className="font-bold text-lg tracking-tight text-gray-800">Bliver</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-full px-3 py-1">
          <Users className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-gray-800">{onlineCount}</span>
        </div>

        {/* Bell — only for logged-in users */}
        {user && (
          <button
            onClick={onBellClick}
            className="relative p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center
                bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-sm font-medium
              rounded-lg hover:bg-red-600 transition-colors shadow-sm"
          >
            <Shield className="w-4 h-4" />
            后台管理
          </button>
        )}

        {user ? (
          <>
            <Link to={`/profile/${user._id}`}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} className="w-7 h-7 rounded-full object-cover ring-2 ring-blue-200 hover:ring-blue-400 transition-all" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-blue-400 transition-all">
                  {user?.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </Link>

            <button
              onClick={onLogout}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-gray-400" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm font-medium
                rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              登录
            </button>
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1 px-3 py-1.5 bg-white text-blue-600 text-sm font-medium
                rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              注册
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
