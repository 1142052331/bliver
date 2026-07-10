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
  const [hasSyncedNotifications, setHasSyncedNotifications] = useState(false);
  const hasSyncedNotificationsRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(READ_COUNT_KEY) || '0', 10) || 0; }
    catch { return 0; }
  });

  const closeNotifs = useUIStore((s) => s.closeNotifs);
  const setActiveFootprintId = useUIStore((s) => s.setActiveFootprintId);

  const markNotificationsSynced = useCallback(() => {
    hasSyncedNotificationsRef.current = true;
    setHasSyncedNotifications(true);
  }, []);

  const setNotifications = useCallback<React.Dispatch<React.SetStateAction<ServerNotification[]>>>((updater) => {
    if (typeof updater === 'function' || updater.length > 0 || hasSyncedNotificationsRef.current) {
      markNotificationsSynced();
    }
    setNotificationsState(updater);
  }, [markNotificationsSynced]);

  // Preserve the cached badge until the first real notification sync.
  useEffect(() => {
    if (!hasSyncedNotifications) return;
    const count = notifications.filter((n) => !n.isRead).length;
    setUnreadCount(count);
    try { localStorage.setItem(READ_COUNT_KEY, String(count)); } catch {}
  }, [hasSyncedNotifications, notifications]);

  const clearNotifications = useCallback(() => {
    markNotificationsSynced();
    setNotificationsState([]);
    setUnreadCount(0);
    try { localStorage.setItem(READ_COUNT_KEY, '0'); } catch {}
  }, [markNotificationsSynced]);

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
    clearNotifications,
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
