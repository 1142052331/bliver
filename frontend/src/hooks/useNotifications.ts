import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';

interface ServerNotification {
  _id: string;
  isRead: boolean;
  footprintId?: string;
  type: string;
  senderName?: string;
  content?: string;
  createdAt: string;
}

const READ_COUNT_KEY = 'bliver_unread_v1';

export default function useNotifications() {
  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(READ_COUNT_KEY) || '0', 10) || 0; }
    catch { return 0; }
  });

  const closeNotifs = useUIStore((s) => s.closeNotifs);
  const setActiveFootprintId = useUIStore((s) => s.setActiveFootprintId);

  // Sync unread counter from server notifications
  useEffect(() => {
    if (notifications.length > 0) {
      const count = notifications.filter((n) => !n.isRead).length;
      setUnreadCount(count);
      try { localStorage.setItem(READ_COUNT_KEY, String(count)); } catch {}
    }
  }, [notifications]);

  const markAsRead = useCallback(async (notifId: string) => {
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      try { localStorage.setItem(READ_COUNT_KEY, String(next)); } catch {}
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    await apiClient.notifications.markRead(notifId).catch(() => {});
  }, []);

  // Batch mark all notifications for a footprint as read (read-on-view)
  const markFootprintRead = useCallback((footprintId: string) => {
    setNotifications((prev) => {
      const toMark = prev.filter(
        (n) => !n.isRead && n.footprintId === footprintId
      );
      if (toMark.length === 0) return prev;
      toMark.forEach((n) => {
        apiClient.notifications.markRead(n._id).catch(() => {});
      });
      const ids = new Set(toMark.map((n) => n._id));
      const unreadRemoved = toMark.length;
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - unreadRemoved);
        try { localStorage.setItem(READ_COUNT_KEY, String(next)); } catch {}
        return next;
      });
      return prev.map((n) => (ids.has(n._id) ? { ...n, isRead: true } : n));
    });
  }, []);

  const handleNotifNavigate = useCallback((n: ServerNotification) => {
    if (!n.isRead) markAsRead(n._id);
    if (n.footprintId) {
      closeNotifs();
      setActiveFootprintId(n.footprintId);
    }
  }, [markAsRead, closeNotifs, setActiveFootprintId]);

  // Auto-mark notifications as read when viewing a footprint
  useEffect(() => {
    const handler = (e: Event) => {
      const footprintId = (e as CustomEvent).detail?.footprintId;
      if (footprintId) markFootprintRead(footprintId);
    };
    window.addEventListener('footprint:viewed', handler);
    return () => window.removeEventListener('footprint:viewed', handler);
  }, [markFootprintRead]);

  return {
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    markAsRead,
    markFootprintRead,
    handleNotifNavigate,
  };
}

/**
 * Fetch notifications from server and merge with socket-delivered ones.
 * Call this on socket connect and tab visibility change.
 */
export async function refetchNotifications(
  setNotifications: (updater: (prev: ServerNotification[]) => ServerNotification[]) => void,
  opts?: Record<string, unknown>
) {
  try {
    const res = await apiClient.notifications.list(opts);
    setNotifications((prev) => {
      const apiIds = new Set(res.data.notifications.map((n: ServerNotification) => n._id));
      const socketOnly = prev.filter((n) => !apiIds.has(n._id));
      return [...socketOnly, ...res.data.notifications];
    });
  } catch { /* silently ignore network errors */ }
}
