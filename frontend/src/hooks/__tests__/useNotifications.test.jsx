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

const unreadKey = 'bliver_unread_v1';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useNotifications unread persistence', () => {
  it('preserves the cached unread badge before notifications have synced', () => {
    localStorage.setItem(unreadKey, '4');

    const { result } = renderHook(() => useNotifications());

    expect(result.current.unreadCount).toBe(4);
    expect(localStorage.getItem(unreadKey)).toBe('4');
  });

  it('does not treat ordinary local array updates as a server sync', () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.setNotifications([]);
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(4);
    expect(localStorage.getItem(unreadKey)).toBe('4');
  });

  it('increments the cached unread count for a unique socket notification before server sync', () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());
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
    expect(localStorage.getItem(unreadKey)).toBe('5');
  });

  it('ignores a repeated socket notification id', () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());
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
    expect(localStorage.getItem(unreadKey)).toBe('5');
  });

  it('clears unread state and storage for an explicit empty server sync', async () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());

    apiClient.notifications.list.mockResolvedValue({ data: { notifications: [] } });

    await act(async () => {
      await refetchNotifications(result.current.applyServerNotifications);
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(localStorage.getItem(unreadKey)).toBe('0');
  });

  it('uses a non-empty server sync as the authoritative unread count', async () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());
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
      await refetchNotifications(result.current.applyServerNotifications);
    });

    expect(result.current.notifications).toEqual(serverNotifications);
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.notifications.filter(({ _id }) => _id === 'socket-only')).toHaveLength(1);
    expect(localStorage.getItem(unreadKey)).toBe('2');
  });

  it('clears notifications, unread state, and storage synchronously', () => {
    localStorage.setItem(unreadKey, '3');
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.clearNotifications();
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(localStorage.getItem(unreadKey)).toBe('0');
  });
});
