import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { refetchNotifications } from './useNotifications';
import { clearAuth, getToken } from '../auth';
import {
  footprintNew,
  footprintUpdated,
  footprintDeleted,
  onlineCount,
  profileUpdated,
  newNotification,
  userOnline,
  userOffline,
  forceLogout,
} from './socketHandlers';

function getSocketURL() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) {
    try { return new URL(import.meta.env.VITE_API_URL).origin; } catch {}
  }
  return window.location.origin;
}

/**
 * Manages Socket.IO connection lifecycle.
 * Event handlers are defined in socketHandlers.js — this hook
 * only handles connect/disconnect and wires up the handler registry.
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

    refetchNotifications(setNotifications);

    const socketUrl = getSocketURL();
    const socket = io(socketUrl, { auth: { token } });
    socketRef.current = socket;
    console.log('[Socket] Connecting:', socketUrl);

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id, 'userId:', user._id?.slice(-6));
      socket.emit('user:online');
    });
    socket.on('connect_error', (e) => console.error('[Socket] Connect error:', e.message));
    socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));

    // ── Domain event handlers ──
    socket.on('online:count', onlineCount(setOnlineCount));
    socket.on('footprint:new', footprintNew(setFootprints));
    socket.on('footprint:updated', footprintUpdated(setFootprints));
    socket.on('footprint:deleted', footprintDeleted(setFootprints));
    socket.on('profile:updated', profileUpdated());
    socket.on('new_notification', newNotification(setNotifications));
    socket.on('user_online', userOnline());
    socket.on('user_offline', userOffline());
    socket.on('force_logout', forceLogout(queryClient, setUser));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return { socketRef };
}
