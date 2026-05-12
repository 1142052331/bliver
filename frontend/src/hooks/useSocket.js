import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { refetchNotifications } from './useNotifications';
import { clearAuth, getToken } from '../auth';
import useUIStore from '../store/useUIStore';

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
}) {
  const socketRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setOnlineCount(0);
      return;
    }

    const token = getToken();
    if (!token) {
      clearAuth();
      setUser(null);
      return;
    }

    // ── Fetch notifications BEFORE socket connects (avoid race) ──
    const socketUrl = getSocketURL();
    refetchNotifications(setNotifications);

    const socket = io(socketUrl, { auth: { token } });
    socketRef.current = socket;
    console.log('[Socket] Connecting:', socketUrl);

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

    const setMsg = useUIStore.getState().setMessageIsland;

    socket.on('new_notification', (data) => {
      setNotifications((prev) => [data.notification, ...prev]);
      const n = data.notification;
      const type = n.type === 'profile_view' ? 'profile_view' : n.type === 'reaction' ? 'reaction' : 'comment';
      setMsg({
        type,
        senderName: n.senderName,
        footprintId: n.footprintId,
        content: n.content,
      });
    });

    socket.on('user_online', (data) => {
      useUIStore.getState().addToast({ type: 'online', content: `${data.name} 上线了`, duration: 3000 });
    });

    socket.on('user_offline', (data) => {
      useUIStore.getState().addToast({ type: 'offline', content: `${data.name} 下线了`, duration: 3000 });
    });

    socket.on('force_logout', (data) => {
      clearAuth();
      queryClient.clear();
      setUser(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return { socketRef };
}
