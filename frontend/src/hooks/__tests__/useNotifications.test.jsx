import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useNotifications, { refetchNotifications } from '../useNotifications';

vi.mock('../../api', () => ({
  apiClient: {
    notifications: {
      markRead: vi.fn(() => Promise.resolve()),
      list: vi.fn(),
    },
  },
}));

vi.mock('../../store/useUIStore', () => {
  const state = {
    closeNotifs: vi.fn(),
    setActiveFootprintId: vi.fn(),
    viewedFootprintId: null,
  };
  const useUIStore = (selector) => selector(state);
  useUIStore.subscribe = vi.fn(() => vi.fn());
  return { default: useUIStore };
});

import { apiClient } from '../../api';

const userId = 'user-1';
const unreadKey = (id) => `bliver_unread_v1:${id}`;

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useNotifications unread persistence', () => {
  it('preserves the cached unread badge before notifications have synced', () => {
    localStorage.setItem(unreadKey(userId), '4');

    const { result } = renderHook(() => useNotifications(userId));

    expect(result.current.unreadCount).toBe(4);
    expect(localStorage.getItem(unreadKey(userId))).toBe('4');
  });

  it('does not treat ordinary local array updates as a server sync', () => {
    localStorage.setItem(unreadKey(userId), '4');
    const { result } = renderHook(() => useNotifications(userId));

    act(() => {
      result.current.setNotifications([]);
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(4);
    expect(localStorage.getItem(unreadKey(userId))).toBe('4');
  });

  it('increments the cached unread count for a unique socket notification before server sync', () => {
    localStorage.setItem(unreadKey(userId), '4');
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'socket-1',
      isRead: false,
      type: 'comment',
      createdAt: '2026-07-10T00:00:00.000Z',
    };

    act(() => {
      result.current.appendNotification(notification);
    });

    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.unreadCount).toBe(5);
    expect(localStorage.getItem(unreadKey(userId))).toBe('5');
  });

  it('ignores a repeated socket notification id', () => {
    localStorage.setItem(unreadKey(userId), '4');
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'socket-1',
      isRead: false,
      type: 'comment',
      createdAt: '2026-07-10T00:00:00.000Z',
    };

    act(() => {
      result.current.appendNotification(notification);
      result.current.appendNotification(notification);
    });

    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.unreadCount).toBe(5);
    expect(localStorage.getItem(unreadKey(userId))).toBe('5');
  });

  it('clears unread state and storage for an explicit empty server sync', async () => {
    localStorage.setItem(unreadKey(userId), '4');
    const { result } = renderHook(() => useNotifications(userId));

    apiClient.notifications.list.mockResolvedValue({ data: { notifications: [] } });

    await act(async () => {
      await refetchNotifications(
        result.current.applyServerNotifications,
        undefined,
        result.current.captureNotificationRequest,
      );
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
  });

  it('uses a non-empty server sync as the authoritative unread count', async () => {
    localStorage.setItem(unreadKey(userId), '4');
    const { result } = renderHook(() => useNotifications(userId));
    const serverNotifications = [
      { _id: 'socket-only', isRead: true, type: 'comment', createdAt: '2026-07-10T00:00:00.000Z' },
      { _id: 'unread-1', isRead: false, type: 'comment', createdAt: '2026-07-10T00:00:00.000Z' },
      { _id: 'unread-2', isRead: false, type: 'comment', createdAt: '2026-07-10T00:00:00.000Z' },
      { _id: 'read', isRead: true, type: 'reaction', createdAt: '2026-07-10T00:00:00.000Z' },
    ];
    apiClient.notifications.list.mockResolvedValue({ data: { notifications: serverNotifications } });

    act(() => {
      result.current.appendNotification({
        _id: 'socket-only',
        isRead: false,
        type: 'comment',
        createdAt: '2026-07-10T00:00:00.000Z',
      });
    });
    await act(async () => {
      await refetchNotifications(
        result.current.applyServerNotifications,
        undefined,
        result.current.captureNotificationRequest,
      );
    });

    expect(result.current.notifications).toEqual(serverNotifications);
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.notifications.filter(({ _id }) => _id === 'socket-only')).toHaveLength(1);
    expect(localStorage.getItem(unreadKey(userId))).toBe('2');
  });

  it('clears notifications, unread state, and storage synchronously', () => {
    localStorage.setItem(unreadKey(userId), '3');
    const { result } = renderHook(() => useNotifications(userId));

    act(() => {
      result.current.clearNotifications();
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
  });

  it('clears local read overrides before applying a later server snapshot', async () => {
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'clear-read-override',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.applyServerNotifications([notification]);
    });
    await act(async () => {
      await result.current.markAsRead(notification._id);
    });

    act(() => {
      result.current.clearNotifications();
      result.current.applyServerNotifications([notification]);
    });

    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.unreadCount).toBe(1);
    expect(localStorage.getItem(unreadKey(userId))).toBe('1');
  });

  it('marks one notification read and persists the scoped unread count', async () => {
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'mark-one',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.appendNotification(notification);
    });

    await act(async () => {
      await result.current.markAsRead(notification._id);
    });

    expect(result.current.notifications).toEqual([{ ...notification, isRead: true }]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
    expect(apiClient.notifications.markRead).toHaveBeenCalledWith(notification._id);
  });

  it('does not repeat a single notification read request', async () => {
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'mark-once',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.appendNotification(notification);
    });

    await act(async () => {
      await Promise.all([
        result.current.markAsRead(notification._id),
        result.current.markAsRead(notification._id),
      ]);
    });

    expect(result.current.notifications).toEqual([{ ...notification, isRead: true }]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
    expect(apiClient.notifications.markRead).toHaveBeenCalledTimes(1);
    expect(apiClient.notifications.markRead).toHaveBeenCalledWith(notification._id);
  });

  it('marks each footprint notification once in StrictMode without changing other items', () => {
    const { result } = renderHook(() => useNotifications(userId), { wrapper: StrictMode });
    const notifications = [
      { _id: 'fp-1-a', isRead: false, footprintId: 'footprint-1', type: 'comment', createdAt: '2026-07-11T00:00:02.000Z' },
      { _id: 'fp-1-b', isRead: false, footprintId: 'footprint-1', type: 'reaction', createdAt: '2026-07-11T00:00:01.000Z' },
      { _id: 'fp-2', isRead: false, footprintId: 'footprint-2', type: 'comment', createdAt: '2026-07-11T00:00:00.000Z' },
    ];
    act(() => {
      notifications.forEach(result.current.appendNotification);
      result.current.markFootprintRead('footprint-1');
    });

    expect(result.current.notifications.find(({ _id }) => _id === 'fp-1-a').isRead).toBe(true);
    expect(result.current.notifications.find(({ _id }) => _id === 'fp-1-b').isRead).toBe(true);
    expect(result.current.notifications.find(({ _id }) => _id === 'fp-2').isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
    expect(localStorage.getItem(unreadKey(userId))).toBe('1');
    expect(apiClient.notifications.markRead).toHaveBeenCalledTimes(2);
    expect(apiClient.notifications.markRead.mock.calls.map(([id]) => id).sort()).toEqual([
      'fp-1-a',
      'fp-1-b',
    ]);
  });

  it('keeps a locally read notification read when an older request resolves', async () => {
    const pending = deferred();
    apiClient.notifications.list.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'stale-single',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.applyServerNotifications([notification]);
    });
    const request = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );

    await act(async () => {
      await result.current.markAsRead(notification._id);
    });
    await act(async () => {
      pending.resolve({ data: { notifications: [notification] } });
      await request;
    });

    expect(result.current.notifications).toEqual([{ ...notification, isRead: true }]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
  });

  it('keeps a locally read footprint read when an older request resolves', async () => {
    const pending = deferred();
    apiClient.notifications.list.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const notifications = [
      { _id: 'stale-fp-a', isRead: false, footprintId: 'footprint-1', type: 'comment', createdAt: '2026-07-11T00:00:02.000Z' },
      { _id: 'stale-fp-b', isRead: false, footprintId: 'footprint-1', type: 'reaction', createdAt: '2026-07-11T00:00:01.000Z' },
      { _id: 'stale-other', isRead: false, footprintId: 'footprint-2', type: 'comment', createdAt: '2026-07-11T00:00:00.000Z' },
    ];
    act(() => {
      result.current.applyServerNotifications(notifications);
    });
    const request = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );

    act(() => {
      result.current.markFootprintRead('footprint-1');
    });
    await act(async () => {
      pending.resolve({ data: { notifications } });
      await request;
    });

    expect(result.current.notifications).toEqual([
      { ...notifications[0], isRead: true },
      { ...notifications[1], isRead: true },
      notifications[2],
    ]);
    expect(result.current.unreadCount).toBe(1);
    expect(localStorage.getItem(unreadKey(userId))).toBe('1');
  });

  it('allows a later server refresh to restore unread after a read request fails', async () => {
    apiClient.notifications.markRead.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useNotifications(userId));
    const notification = {
      _id: 'failed-read',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.applyServerNotifications([notification]);
    });

    await act(async () => {
      await result.current.markAsRead(notification._id);
    });
    act(() => {
      result.current.applyServerNotifications([notification]);
    });

    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.unreadCount).toBe(1);
    expect(localStorage.getItem(unreadKey(userId))).toBe('1');
  });

  it('removes only the failed footprint read override', async () => {
    apiClient.notifications.markRead
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce();
    const { result } = renderHook(() => useNotifications(userId));
    const notifications = [
      { _id: 'failed-footprint-read', isRead: false, footprintId: 'footprint-1', type: 'comment', createdAt: '2026-07-11T00:00:01.000Z' },
      { _id: 'successful-footprint-read', isRead: false, footprintId: 'footprint-1', type: 'reaction', createdAt: '2026-07-11T00:00:00.000Z' },
    ];
    act(() => {
      result.current.applyServerNotifications(notifications);
    });

    await act(async () => {
      result.current.markFootprintRead('footprint-1');
      await Promise.resolve();
    });
    act(() => {
      result.current.applyServerNotifications(notifications);
    });

    expect(result.current.notifications).toEqual([
      notifications[0],
      { ...notifications[1], isRead: true },
    ]);
    expect(result.current.unreadCount).toBe(1);
    expect(apiClient.notifications.markRead).toHaveBeenCalledTimes(2);
  });

  it('clears a local read override after the server confirms the notification is read', async () => {
    const { result } = renderHook(() => useNotifications(userId));
    const unreadNotification = {
      _id: 'confirmed-read',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.applyServerNotifications([unreadNotification]);
    });
    await act(async () => {
      await result.current.markAsRead(unreadNotification._id);
    });

    act(() => {
      result.current.applyServerNotifications([{ ...unreadNotification, isRead: true }]);
      result.current.applyServerNotifications([unreadNotification]);
    });

    expect(result.current.notifications).toEqual([unreadNotification]);
    expect(result.current.unreadCount).toBe(1);
  });

  it('keeps a local read override when an older request confirms read first', async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    const markReadRequest = deferred();
    apiClient.notifications.list
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    apiClient.notifications.markRead.mockReturnValueOnce(markReadRequest.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const unreadNotification = {
      _id: 'out-of-order-read-confirmation',
      isRead: false,
      footprintId: 'footprint-1',
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    act(() => {
      result.current.applyServerNotifications([unreadNotification]);
    });
    const firstRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );
    let markRequest;
    act(() => {
      markRequest = result.current.markAsRead(unreadNotification._id);
    });
    const secondRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );

    await act(async () => {
      markReadRequest.resolve({ data: { ok: true } });
      await markRequest;
    });
    await act(async () => {
      firstRequest.resolve({
        data: { notifications: [{ ...unreadNotification, isRead: true }] },
      });
      await firstRefetch;
    });
    await act(async () => {
      secondRequest.resolve({ data: { notifications: [unreadNotification] } });
      await secondRefetch;
    });

    expect(result.current.notifications).toEqual([{ ...unreadNotification, isRead: true }]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey(userId))).toBe('0');
  });

  it('does not carry local read overrides into another user session', async () => {
    const sharedNotificationId = 'same-id-different-user';
    const notification = {
      _id: sharedNotificationId,
      isRead: false,
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    const { result, rerender } = renderHook(
      ({ activeUserId }) => useNotifications(activeUserId),
      { initialProps: { activeUserId: userId } },
    );
    act(() => {
      result.current.applyServerNotifications([notification]);
    });
    await act(async () => {
      await result.current.markAsRead(sharedNotificationId);
    });

    rerender({ activeUserId: 'user-2' });
    act(() => {
      result.current.applyServerNotifications([notification]);
    });

    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.unreadCount).toBe(1);
    expect(localStorage.getItem(unreadKey('user-2'))).toBe('1');
  });

  it('preserves socket arrivals received after a request starts while preferring matching server items', async () => {
    const pending = deferred();
    apiClient.notifications.list.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const socketOnly = {
      _id: 'socket-only',
      isRead: false,
      type: 'comment',
      content: 'socket only',
      createdAt: '2026-07-11T00:00:02.000Z',
    };
    const socketVersion = {
      _id: 'shared',
      isRead: false,
      type: 'comment',
      content: 'socket version',
      createdAt: '2026-07-11T00:00:01.000Z',
    };
    const serverVersion = {
      ...socketVersion,
      isRead: true,
      content: 'server version',
    };
    const serverOnly = {
      _id: 'server-only',
      isRead: false,
      type: 'reaction',
      createdAt: '2026-07-11T00:00:00.000Z',
    };

    const request = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );
    act(() => {
      result.current.appendNotification(socketVersion);
      result.current.appendNotification(socketOnly);
    });

    await act(async () => {
      pending.resolve({ data: { notifications: [serverVersion, serverOnly] } });
      await request;
    });

    expect(result.current.notifications).toEqual([socketOnly, serverVersion, serverOnly]);
    expect(result.current.notifications.filter(({ _id }) => _id === 'shared')).toHaveLength(1);
    expect(result.current.unreadCount).toBe(2);
  });

  it('retains a post-request arrival across two pre-arrival snapshots', async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    apiClient.notifications.list
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const socketNotification = {
      _id: 'arrived-after-both-requests',
      isRead: false,
      type: 'comment',
      content: 'socket version',
      createdAt: '2026-07-11T00:00:01.000Z',
    };
    const serverNotification = {
      ...socketNotification,
      isRead: true,
      content: 'server version',
    };

    const firstRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );
    const secondRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );
    act(() => result.current.appendNotification(socketNotification));

    await act(async () => {
      firstRequest.resolve({ data: { notifications: [serverNotification] } });
      await firstRefetch;
    });
    expect(result.current.notifications).toEqual([serverNotification]);
    expect(result.current.unreadCount).toBe(0);

    await act(async () => {
      secondRequest.resolve({ data: { notifications: [] } });
      await secondRefetch;
    });

    expect(result.current.notifications).toEqual([serverNotification]);
    expect(result.current.notifications.filter(({ _id }) => (
      _id === socketNotification._id
    ))).toHaveLength(1);
    expect(result.current.unreadCount).toBe(0);
  });

  it('ignores an older response after a newer same-session snapshot has applied', async () => {
    const olderRequest = deferred();
    const newerRequest = deferred();
    apiClient.notifications.list
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(newerRequest.promise);
    const { result } = renderHook(() => useNotifications(userId));
    const socketNotification = {
      _id: 'socket-between-requests',
      isRead: false,
      type: 'comment',
      createdAt: '2026-07-11T00:00:01.000Z',
    };
    const authoritativeSocketNotification = {
      ...socketNotification,
      isRead: true,
      content: 'newer server version',
    };
    const newerServerNotification = {
      _id: 'newer-server-only',
      isRead: false,
      type: 'reaction',
      createdAt: '2026-07-11T00:00:02.000Z',
    };
    const staleServerNotification = {
      _id: 'stale-server-only',
      isRead: false,
      type: 'comment',
      createdAt: '2026-07-11T00:00:00.000Z',
    };

    const firstRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );
    act(() => result.current.appendNotification(socketNotification));
    const secondRefetch = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );

    await act(async () => {
      newerRequest.resolve({
        data: { notifications: [authoritativeSocketNotification, newerServerNotification] },
      });
      await secondRefetch;
    });
    await act(async () => {
      olderRequest.resolve({ data: { notifications: [staleServerNotification] } });
      await firstRefetch;
    });

    expect(result.current.notifications).toEqual([
      authoritativeSocketNotification,
      newerServerNotification,
    ]);
    expect(result.current.unreadCount).toBe(1);
  });

  it.each([
    ['logout', null, 0],
    ['account switch', 'user-2', 2],
  ])('ignores a notification response that resolves after %s', async (_label, nextUserId, expectedUnread) => {
    if (nextUserId) localStorage.setItem(unreadKey(nextUserId), String(expectedUnread));
    const pending = deferred();
    apiClient.notifications.list.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ activeUserId }) => useNotifications(activeUserId),
      { initialProps: { activeUserId: userId } },
    );
    const request = refetchNotifications(
      result.current.applyServerNotifications,
      undefined,
      result.current.captureNotificationRequest,
    );

    rerender({ activeUserId: nextUserId });
    await act(async () => {
      pending.resolve({
        data: {
          notifications: [{
            _id: 'old-session',
            isRead: false,
            type: 'comment',
            createdAt: '2026-07-11T00:00:00.000Z',
          }],
        },
      });
      await request;
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(expectedUnread);
  });

  it('isolates cached unread state by user and always reports zero for guests', () => {
    localStorage.setItem('bliver_unread_v1', '9');
    localStorage.setItem(unreadKey(userId), '4');
    localStorage.setItem(unreadKey('user-2'), '1');
    const { result, rerender } = renderHook(
      ({ activeUserId }) => useNotifications(activeUserId),
      { initialProps: { activeUserId: userId } },
    );

    expect(result.current.unreadCount).toBe(4);
    act(() => {
      result.current.appendNotification({
        _id: 'user-1-only',
        isRead: false,
        type: 'comment',
        createdAt: '2026-07-11T00:00:00.000Z',
      });
    });
    expect(localStorage.getItem(unreadKey(userId))).toBe('5');

    rerender({ activeUserId: 'user-2' });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(1);

    rerender({ activeUserId: null });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem('bliver_unread_v1')).toBe('9');
  });
});
