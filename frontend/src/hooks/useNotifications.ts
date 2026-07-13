import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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

interface NotificationRequestContext {
  userId: string;
  sessionGeneration: symbol;
  socketSequence: number;
  requestSequence: number;
}

interface SocketArrival {
  notification: ServerNotification;
  sequence: number;
}

interface NotificationState {
  sessionGeneration: symbol;
  items: ServerNotification[];
}

interface UnreadState {
  sessionGeneration: symbol;
  count: number;
}

const READ_COUNT_KEY_PREFIX = 'bliver_unread_v1:';

function readUnreadCount(userId: string | null) {
  if (!userId) return 0;
  try {
    return parseInt(localStorage.getItem(`${READ_COUNT_KEY_PREFIX}${userId}`) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeUnreadCount(userId: string | null, count: number) {
  if (!userId) return;
  try { localStorage.setItem(`${READ_COUNT_KEY_PREFIX}${userId}`, String(count)); } catch { /* Ignore storage failures. */ }
}

export default function useNotifications(userId?: string | null) {
  const activeUserId = typeof userId === 'string' && userId ? userId : null;
  const sessionGeneration = useMemo(() => Symbol('notification-session'), [activeUserId]);
  const notificationsRef = useRef<ServerNotification[]>([]);
  const notificationIdsRef = useRef(new Set<string>());
  const unreadCountRef = useRef(readUnreadCount(activeUserId));
  const localReadOverridesRef = useRef(new Set<string>());
  const socketArrivalsRef = useRef(new Map<string, SocketArrival>());
  const socketSequenceRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const latestAppliedRequestRef = useRef(0);
  const committedSessionRef = useRef({ userId: activeUserId, generation: sessionGeneration });
  const [notificationState, setNotificationsState] = useState<NotificationState>(() => ({
    sessionGeneration,
    items: [],
  }));
  const [unreadState, setUnreadState] = useState<UnreadState>(() => ({
    sessionGeneration,
    count: readUnreadCount(activeUserId),
  }));
  const notifications = notificationState.sessionGeneration === sessionGeneration
    ? notificationState.items
    : [];
  const unreadCount = !activeUserId
    ? 0
    : unreadState.sessionGeneration === sessionGeneration
      ? unreadState.count
      : readUnreadCount(activeUserId);

  useLayoutEffect(() => {
    committedSessionRef.current = { userId: activeUserId, generation: sessionGeneration };
    notificationsRef.current = [];
    notificationIdsRef.current = new Set();
    localReadOverridesRef.current = new Set();
    socketArrivalsRef.current = new Map();
    socketSequenceRef.current = 0;
    requestSequenceRef.current = 0;
    latestAppliedRequestRef.current = 0;
    const nextUnreadCount = readUnreadCount(activeUserId);
    unreadCountRef.current = nextUnreadCount;
    setNotificationsState({ sessionGeneration, items: [] });
    setUnreadState({ sessionGeneration, count: nextUnreadCount });
  }, [activeUserId, sessionGeneration]);

  const isActiveSession = useCallback(() => {
    const session = committedSessionRef.current;
    return session.userId === activeUserId && session.generation === sessionGeneration;
  }, [activeUserId, sessionGeneration]);

  const setUnreadCount = useCallback<React.Dispatch<React.SetStateAction<number>>>((updater) => {
    if (!isActiveSession()) return;
    const nextCount = typeof updater === 'function' ? updater(unreadCountRef.current) : updater;
    const scopedCount = activeUserId ? Math.max(0, nextCount) : 0;
    unreadCountRef.current = scopedCount;
    writeUnreadCount(activeUserId, scopedCount);
    setUnreadState({ sessionGeneration, count: scopedCount });
  }, [activeUserId, isActiveSession, sessionGeneration]);

  const updateSocketArrival = useCallback((notification: ServerNotification) => {
    const arrival = socketArrivalsRef.current.get(notification._id);
    if (!arrival) return;
    socketArrivalsRef.current.set(notification._id, { ...arrival, notification });
  }, []);

  const closeNotifs = useUIStore((s) => s.closeNotifs);
  const setActiveFootprintId = useUIStore((s) => s.setActiveFootprintId);

  const setNotifications = useCallback<React.Dispatch<React.SetStateAction<ServerNotification[]>>>((updater) => {
    if (!isActiveSession()) return;
    const nextNotifications = typeof updater === 'function'
      ? updater(notificationsRef.current)
      : updater;
    notificationsRef.current = nextNotifications;
    notificationIdsRef.current = new Set(
      nextNotifications.map((notification) => notification._id),
    );
    socketArrivalsRef.current = new Map(
      [...socketArrivalsRef.current].filter(([id]) => notificationIdsRef.current.has(id)),
    );
    setNotificationsState({ sessionGeneration, items: nextNotifications });
  }, [isActiveSession, sessionGeneration]);

  const appendNotification = useCallback((notification: ServerNotification) => {
    if (!activeUserId || !isActiveSession()) return;
    if (notificationIdsRef.current.has(notification._id)) return;
    notificationIdsRef.current.add(notification._id);
    socketArrivalsRef.current.set(notification._id, {
      notification,
      sequence: ++socketSequenceRef.current,
    });
    const nextNotifications = [
      notification,
      ...notificationsRef.current,
    ];
    notificationsRef.current = nextNotifications;
    setNotificationsState({
      sessionGeneration,
      items: nextNotifications,
    });
    if (!notification.isRead) setUnreadCount((count) => count + 1);
  }, [activeUserId, isActiveSession, sessionGeneration, setUnreadCount]);

  const captureNotificationRequest = useCallback((): NotificationRequestContext | null => {
    if (!activeUserId || !isActiveSession()) return null;
    return {
      userId: activeUserId,
      sessionGeneration,
      socketSequence: socketSequenceRef.current,
      requestSequence: ++requestSequenceRef.current,
    };
  }, [activeUserId, isActiveSession, sessionGeneration]);

  const applyServerNotifications = useCallback((
    nextNotifications: ServerNotification[],
    requestContext?: NotificationRequestContext | null,
  ) => {
    const context = requestContext ?? captureNotificationRequest();
    const session = committedSessionRef.current;
    if (!context
      || !session.userId
      || context.userId !== session.userId
      || context.sessionGeneration !== session.generation
      || context.requestSequence < latestAppliedRequestRef.current) {
      return;
    }
    latestAppliedRequestRef.current = context.requestSequence;

    const localReadOverrides = localReadOverridesRef.current;
    if (context.requestSequence === requestSequenceRef.current) {
      nextNotifications.forEach((notification) => {
        if (notification.isRead) localReadOverrides.delete(notification._id);
      });
    }
    const reconciledServerNotifications = nextNotifications.map((notification) => (
      localReadOverrides.has(notification._id) && !notification.isRead
        ? { ...notification, isRead: true }
        : notification
    ));
    const serverById = new Map(
      reconciledServerNotifications.map((notification) => [notification._id, notification]),
    );
    const retainedArrivals = [...socketArrivalsRef.current.values()]
      .filter(({ sequence }) => sequence > context.socketSequence)
      .map((arrival) => ({
        ...arrival,
        notification: serverById.get(arrival.notification._id) ?? arrival.notification,
      }));
    const preservedArrivals = retainedArrivals
      .filter(({ notification }) => !serverById.has(notification._id))
      .sort((left, right) => right.sequence - left.sequence);
    const mergedNotifications = [
      ...preservedArrivals.map(({ notification }) => notification),
      ...reconciledServerNotifications,
    ];

    notificationsRef.current = mergedNotifications;
    notificationIdsRef.current = new Set(
      mergedNotifications.map((notification) => notification._id),
    );
    socketArrivalsRef.current = new Map(
      retainedArrivals.map((arrival) => [arrival.notification._id, arrival]),
    );
    setNotificationsState({
      sessionGeneration: session.generation,
      items: mergedNotifications,
    });
    setUnreadCount(
      mergedNotifications.filter((notification) => !notification.isRead).length,
    );
  }, [captureNotificationRequest, setUnreadCount]);

  const clearNotifications = useCallback(() => {
    if (!isActiveSession()) return;
    notificationsRef.current = [];
    notificationIdsRef.current = new Set();
    localReadOverridesRef.current = new Set();
    socketArrivalsRef.current = new Map();
    setNotificationsState({ sessionGeneration, items: [] });
    setUnreadCount(0);
  }, [isActiveSession, sessionGeneration, setUnreadCount]);

  const markAsRead = useCallback(async (notifId: string) => {
    if (!isActiveSession()) return;
    const notificationToMark = notificationsRef.current.find(
      (notification) => notification._id === notifId && !notification.isRead,
    );
    if (!notificationToMark) return;
    const readNotification = { ...notificationToMark, isRead: true };
    const nextNotifications = notificationsRef.current.map((notification) => (
      notification._id === notifId ? readNotification : notification
    ));
    const localReadOverrides = localReadOverridesRef.current;
    localReadOverrides.add(notifId);
    notificationsRef.current = nextNotifications;
    updateSocketArrival(readNotification);
    setUnreadCount((count) => Math.max(0, count - 1));
    setNotificationsState({
      sessionGeneration,
      items: nextNotifications,
    });
    await apiClient.notifications.markRead(notifId).catch(() => {
      localReadOverrides.delete(notifId);
    });
  }, [isActiveSession, sessionGeneration, setUnreadCount, updateSocketArrival]);

  // Batch mark all notifications for a footprint as read (read-on-view)
  const markFootprintRead = useCallback((footprintId: string) => {
    if (!isActiveSession()) return;
    const toMark = notificationsRef.current.filter(
      (notification) => !notification.isRead && notification.footprintId === footprintId,
    );
    if (toMark.length === 0) return;
    const ids = new Set(toMark.map((notification) => notification._id));
    const localReadOverrides = localReadOverridesRef.current;
    ids.forEach((id) => localReadOverrides.add(id));
    const nextNotifications = notificationsRef.current.map((notification) => (
      ids.has(notification._id) ? { ...notification, isRead: true } : notification
    ));
    notificationsRef.current = nextNotifications;
    nextNotifications
      .filter((notification) => ids.has(notification._id))
      .forEach(updateSocketArrival);
    setUnreadCount((count) => Math.max(0, count - toMark.length));
    setNotificationsState({
      sessionGeneration,
      items: nextNotifications,
    });
    toMark.forEach((notification) => {
      apiClient.notifications.markRead(notification._id).catch(() => {
        localReadOverrides.delete(notification._id);
      });
    });
  }, [isActiveSession, sessionGeneration, setUnreadCount, updateSocketArrival]);

  const handleNotifNavigate = useCallback((notification: ServerNotification) => {
    if (!notification.isRead) markAsRead(notification._id);
    if (notification.footprintId) {
      closeNotifs();
      setActiveFootprintId(notification.footprintId);
    }
  }, [markAsRead, closeNotifs, setActiveFootprintId]);

  // Auto-mark notifications as read when viewing a footprint
  useEffect(() => {
    const unsub = useUIStore.subscribe(
      (state) => state.viewedFootprintId,
      (footprintId) => {
        if (footprintId) markFootprintRead(footprintId);
      },
    );
    return unsub;
  }, [markFootprintRead]);

  return {
    notifications,
    setNotifications,
    appendNotification,
    applyServerNotifications,
    captureNotificationRequest,
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
  applyServerNotifications: (
    notifications: ServerNotification[],
    requestContext?: NotificationRequestContext | null,
  ) => void,
  opts?: Record<string, unknown>,
  captureNotificationRequest?: () => NotificationRequestContext | null,
) {
  const requestContext = captureNotificationRequest?.();
  if (captureNotificationRequest && !requestContext) return;
  try {
    const res = await apiClient.notifications.list(opts);
    applyServerNotifications(res.data.notifications, requestContext);
  } catch { /* silently ignore network errors */ }
}
