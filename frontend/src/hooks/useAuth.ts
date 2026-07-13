import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api';
import { getUser, getToken, clearAuth, saveUser } from '../auth';
import { broadcastLogout, listenAuthSync } from '../authSync';
import { subscribeToPush } from '../push';
import useUIStore from '../store/useUIStore';
import { isAdminUser, isSuperuser } from '../domain/superuser';

interface AppUser {
  _id: string;
  id: string;
  name: string;
  avatarUrl?: string;
  profileBannerUrl?: string;
  role: 'user' | 'admin';
  lastFootprintVisibility?: 'public' | 'friends' | 'private';
}

interface PendingAction {
  type: 'checkin' | 'comment' | 'reply' | 'react' | 'report';
  footprintId?: string;
  targetType?: 'footprint' | 'comment';
  targetId?: string;
  draft?: string;
  source?: 'activity' | 'map';
}

export default function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [restoredAction, setRestoredAction] = useState<PendingAction | null>(null);
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
    const requestToken = getToken();
    const requestViewerId = saved?._id;
    const isCurrentSession = () => {
      const currentUser = getUser();
      return !controller.signal.aborted
        && getToken() === requestToken
        && currentUser?._id === requestViewerId;
    };

    if (saved && requestToken) {
      apiClient.auth.me({ signal: controller.signal }).then((res) => {
        if (!isCurrentSession()) return;
        const u: AppUser = res.data.user;
        setUser(u);
        saveUser(u);
        subscribeToPush().catch(() => {});
      }).catch((err: Error) => {
        if (err.name === 'CanceledError' || !isCurrentSession()) return;
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
      } else {
        setRestoredAction(action);
        if (action.footprintId && action.source !== 'activity') {
          setActiveFootprintId(action.footprintId);
        }
      }
    }
  }, [user]);

  const consumePendingAction = useCallback(() => {
    const action = restoredAction;
    setRestoredAction(null);
    return action;
  }, [restoredAction]);

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

  const isAdmin = isAdminUser(user);
  const isAsen = isSuperuser(user);

  return {
    user,
    setUser,
    isAdmin,
    isAsen,
    requireLogin,
    logout,
    pendingActionRef,
    restoredAction,
    consumePendingAction,
  };
}
