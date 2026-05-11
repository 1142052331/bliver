import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { getUser, getToken, clearAuth, isAutoLogin } from '../auth';
import { broadcastLogout, listenAuthSync } from '../authSync';
import { subscribeToPush } from '../push';
import useUIStore from '../store/useUIStore';

interface AppUser {
  _id: string;
  name: string;
  avatarUrl?: string;
  role: 'user' | 'admin';
}

interface PendingAction {
  type: 'checkin' | 'comment' | 'react';
  footprintId?: string;
}

export default function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);

  const openCheckIn = useUIStore((s) => s.openCheckIn);
  const setActiveFootprintId = useUIStore((s) => s.setActiveFootprintId);
  const openAuth = useUIStore((s) => s.openAuth);
  const setAuthMessage = useUIStore((s) => s.setAuthMessage);
  const setAuthTab = useUIStore((s) => s.setAuthTab);

  // ── Auto-login on mount ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const saved = getUser();
    if (saved && getToken() && isAutoLogin()) {
      api.get('/api/auth/me', { signal: controller.signal }).then((res) => {
        const u: AppUser = res.data.user;
        setUser(u);
        subscribeToPush().catch(() => {});
      }).catch((err: Error) => {
        if (err.name === 'CanceledError') return;
        clearAuth();
        setUser(null);
      });
    }
    return () => controller.abort();
  }, []);

  // ── Cross-tab auth sync (BroadcastChannel) ─────────────
  useEffect(() => {
    return listenAuthSync({
      currentUserId: user?._id,
      onForeignLogin: () => {
        if (!user?._id) return;
        clearAuth();
        window.location.reload();
      },
      onForeignLogout: () => {
        if (!user?._id) return;
        clearAuth();
        window.location.reload();
      },
    });
  }, [user?._id]);

  // ── Execute pending action after login ─────────────────
  useEffect(() => {
    if (user && pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action.type === 'checkin') {
        openCheckIn();
      } else if (action.footprintId) {
        setActiveFootprintId(action.footprintId);
      }
    }
  }, [user]);

  const requireLogin = useCallback((action: PendingAction) => {
    if (!user) {
      pendingActionRef.current = action;
      setAuthMessage('登录后即可参与互动喔！');
      setAuthTab('login');
      openAuth();
      return false;
    }
    return true;
  }, [user]);

  const logout = useCallback(() => {
    const uid = user?._id;
    clearAuth();
    broadcastLogout(uid);
    setUser(null);
  }, [user]);

  const isAdmin = user?.role === 'admin';
  const isAsen = user?.name === '阿森';

  return {
    user,
    setUser,
    isAdmin,
    isAsen,
    requireLogin,
    logout,
    pendingActionRef,
  };
}
