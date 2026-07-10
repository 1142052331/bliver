import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [notifications, setNotificationsState] = useState<ServerNotification[]>([]);
  const notificationIdsRef = useRef(new Set<string>());
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(READ_COUNT_KEY) || '0', 10) || 0; }
    catch { return 0; }
  });

  const closeNotifs = useUIStore((s) => s.closeNotifs);
  const setActiveFootprintId = useUIStore((s) => s.setActiveFootprintId);

  const persistUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
    try { localStorage.setItem(READ_COUNT_KEY, String(count)); } catch {}
  }, []);

  const setNotifications = useCallback<React.Dispatch<React.SetStateAction<ServerNotification[]>>>((updater) => {
    setNotificationsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      notificationIdsRef.current = new Set(next.map((notification) => notification._id));
      return next;
    });
  }, []);

  const appendNotification = useCallback((notification: ServerNotification) => {
    if (notificationIdsRef.current.has(notification._id)) return;
    notificationIdsRef.current.add(notification._id);
    setNotificationsState((prev) => [notification, ...prev]);
    if (!notification.isRead) {
      setUnreadCount((count) => {
        const next = count + 1;
        try { localStorage.setItem(READ_COUNT_KEY, String(next)); } catch {}
        return next;
      });
    }
  }, []);

  const applyServerNotifications = useCallback((nextNotifications: ServerNotification[]) => {
    notificationIdsRef.current = new Set(nextNotifications.map((notification) => notification._id));
    setNotificationsState(nextNotifications);
    persistUnreadCount(nextNotifications.filter((notification) => !notification.isRead).length);
  }, [persistUnreadCount]);

  const clearNotifications = useCallback(() => {
    notificationIdsRef.current.clear();
    setNotificationsState([]);
    persistUnreadCount(0);
  }, [persistUnreadCount]);

  const markAsRead = useCallback(async (notifId: string) => {
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      try { localStorage.setItem(READ_COUNT_KEY, String(next)); } catch {}
      return next;
    });
    setNotificationsState((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    await apiClient.notifications.markRead(notifId).catch(() => {});
  }, []);

  // Batch mark all notifications for a footprint as read (read-on-view)
  const markFootprintRead = useCallback((footprintId: string) => {
    setNotificationsState((prev) => {
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
    const unsub = useUIStore.subscribe(
      (s) => s.viewedFootprintId,
      (footprintId) => {
        if (footprintId) markFootprintRead(footprintId);
      }
    );
    return unsub;
  }, [markFootprintRead]);

  return {
    notifications,
    setNotifications,
    appendNotification,
    applyServerNotifications,
    clearNotifications,
    unreadCount,
    setUnreadCount,
    markAsRead,
    markFootprintRead,
    handleNotifNavigate,
  };
}

/**
 * Fetch the authoritative notification snapshot from the server.
 * Call this on socket connect and tab visibility change.
 */
export async function refetchNotifications(
  applyServerNotifications: (notifications: ServerNotification[]) => void,
  opts?: Record<string, unknown>
) {
  try {
    const res = await apiClient.notifications.list(opts);
    applyServerNotifications(res.data.notifications);
  } catch { /* silently ignore network errors */ }
}
