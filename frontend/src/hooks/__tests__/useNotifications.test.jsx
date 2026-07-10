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

  it('clears unread state and storage for an explicit empty server sync', async () => {
    localStorage.setItem(unreadKey, '4');
    const { result } = renderHook(() => useNotifications());

    apiClient.notifications.list.mockResolvedValue({ data: { notifications: [] } });

    await act(async () => {
      await refetchNotifications(result.current.setNotifications);
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(localStorage.getItem(unreadKey)).toBe('0');
  });

  it('calculates and persists unread state for a non-empty sync', async () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.setNotifications([
        { _id: 'unread', isRead: false, type: 'comment', createdAt: '2026-07-10T00:00:00.000Z' },
        { _id: 'read', isRead: true, type: 'reaction', createdAt: '2026-07-10T00:00:00.000Z' },
      ]);
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(localStorage.getItem(unreadKey)).toBe('1');
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
