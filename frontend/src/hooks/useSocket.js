import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { refetchNotifications } from './useNotifications';
import { clearAuth, getToken } from '../auth';
import { setSocket, clearSocket, on, off } from './socketRegistry';
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
  resetFootprintEventLedger,
} from './socketHandlers';

function getSocketURL() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) {
    try { return new URL(import.meta.env.VITE_API_URL).origin; } catch { /* use the current origin */ }
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
  setNotifications,
  appendNotification,
  applyServerNotifications,
  captureNotificationRequest,
  setOnlineCount,
}) {
  const socketRef = useRef(null);
  const queryClient = useQueryClient();
  const viewerIdentity = user?.role === 'admin' ? `admin:${user._id}` : user?._id ? `user:${user._id}` : 'guest';

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

    const notificationController = new AbortController();
    refetchNotifications(
      applyServerNotifications,
      { signal: notificationController.signal },
      captureNotificationRequest,
    );

    const socketUrl = getSocketURL();
    const socket = io(socketUrl, { auth: { token } });
    socketRef.current = socket;
    setSocket(socket);
    console.log('[Socket] Connecting:', socketUrl);

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id, 'userId:', user._id?.slice(-6));
      socket.emit('user:online');
    });
    socket.on('connect_error', (e) => console.error('[Socket] Connect error:', e.message));
    socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));

    // ── Domain event handlers via registry ──
    const domainHandlers = {
      'online:count': onlineCount(setOnlineCount),
      'footprint:new': footprintNew(queryClient, viewerIdentity),
      'footprint:updated': footprintUpdated(queryClient, viewerIdentity),
      'footprint:deleted': footprintDeleted(queryClient, viewerIdentity),
      'profile:updated': profileUpdated(),
      'new_notification': newNotification(appendNotification),
      'user_online': userOnline(),
      'user_offline': userOffline(),
      'force_logout': forceLogout(queryClient, setUser),
    };
    for (const [event, handler] of Object.entries(domainHandlers)) {
      on(event, handler);
    }

    return () => {
      notificationController.abort();
      for (const [event, handler] of Object.entries(domainHandlers)) {
        off(event, handler);
      }
      clearSocket();
      socket.disconnect();
      socketRef.current = null;
      resetFootprintEventLedger(queryClient, viewerIdentity);
    };
  }, [user, viewerIdentity]);

  return { socketRef };
}
