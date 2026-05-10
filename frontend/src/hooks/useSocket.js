import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api';
import { clearAuth, getToken } from '../auth';

function getSocketURL() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) {
    try { return new URL(import.meta.env.VITE_API_URL).origin; } catch {}
  }
  return window.location.origin;
}

/**
 * 管理 Socket.IO 连接生命周期和所有实时事件监听。
 * 仅在 user 存在时连接，logout / 踢出时自动断开。
 */
export default function useSocket({
  user,
  setUser,
  setFootprints,
  setNotifications,
  setOnlineCount,
  setToast,
}) {
  const socketRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setOnlineCount(0);
      return;
    }

    // ── Defensive: verify stored token belongs to current user ──
    const token = getToken();
    if (!token) {
      clearAuth();
      setUser(null);
      return;
    }
    // Decode JWT payload to verify identity match (prevents cross-tab token pollution)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id !== user._id) {
        console.warn('[Socket] Token mismatch — clearing stale auth');
        clearAuth();
        setUser(null);
        return;
      }
    } catch {}

    // Initial notification fetch
    api.get('/api/notifications').then((res) => {
      setNotifications(res.data.notifications);
    }).catch(() => {});

    const socketUrl = getSocketURL();
    console.log('[Socket] Connecting to:', socketUrl);
    const socket = io(socketUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id, 'userId:', user._id?.slice(-6));
      socket.emit('user:online');
    });
    socket.on('connect_error', (e) => console.error('[Socket] Connect error:', e.message));
    socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));

    socket.on('online:count', (data) => {
      setOnlineCount(data.count);
    });

    socket.on('footprint:new', (data) => {
      setFootprints((prev) => [data.footprint, ...prev]);
      window.dispatchEvent(new CustomEvent('ws:footprint:new', { detail: data }));
    });

    socket.on('footprint:updated', (data) => {
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id
          ? { ...fp, reactions: data.footprint.reactions, comments: data.footprint.comments }
          : fp))
      );
      window.dispatchEvent(new CustomEvent('ws:footprint:updated', { detail: data }));
    });

    socket.on('footprint:deleted', (data) => {
      setFootprints((prev) => prev.filter((fp) => fp._id !== data.footprintId));
      window.dispatchEvent(new CustomEvent('ws:footprint:deleted', { detail: data }));
    });

    socket.on('profile:updated', (data) => {
      window.dispatchEvent(new CustomEvent('ws:profile:updated', { detail: data }));
    });

    // Toast helper: show message, auto-dismiss after ms
    const showToast = (msg, ms) => {
      setToast(msg);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), ms);
    };

    socket.on('new_notification', (data) => {
      setNotifications((prev) => [data.notification, ...prev]);
      const n = data.notification;
      const msg = n.type === 'reaction'
        ? `${n.senderName} 对你的打卡表示了 ${n.content}`
        : n.type === 'profile_view'
          ? `${n.senderName} 浏览了你的主页`
          : `${n.senderName} 评论了你`;
      showToast(msg, 4000);
    });

    socket.on('user_online', (data) => {
      showToast(`${data.name} 上线了`, 3000);
    });

    socket.on('user_offline', (data) => {
      showToast(`${data.name} 下线了`, 3000);
    });

    socket.on('force_logout', (data) => {
      clearAuth();
      alert(data?.reason || '您已被管理员踢出');
      setUser(null);
    });

    return () => {
      clearTimeout(toastTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return { socketRef, toastTimerRef };
}
