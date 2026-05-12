import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useAnnounceUnread from '../hooks/useAnnounceUnread';

vi.mock('../api', () => ({
  default: {},
  apiClient: {
    announcements: {
      list: vi.fn(),
    },
  },
}));

import { apiClient } from '../api';

const STORAGE_KEY = 'bliver_announce_read_last';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(STORAGE_KEY);
});

describe('useAnnounceUnread', () => {
  test('returns [false, fn] when user is null', () => {
    const { result } = renderHook(() => useAnnounceUnread(null));
    expect(result.current[0]).toBe(false);
    expect(apiClient.announcements.list).not.toHaveBeenCalled();
  });

  test('returns [true, fn] when API returns unread announcements', async () => {
    localStorage.setItem(STORAGE_KEY, '0');

    apiClient.announcements.list.mockResolvedValue({
      data: { announcements: [{ _id: 'a1', createdAt: new Date().toISOString() }] },
    });

    const { result } = renderHook(() => useAnnounceUnread({ _id: 'u1' }));

    expect(result.current[0]).toBe(false); // loading

    await waitFor(() => {
      expect(result.current[0]).toBe(true);
    });
  });

  test('returns [false, fn] when all announcements are already read', async () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + 86400000));

    apiClient.announcements.list.mockResolvedValue({
      data: { announcements: [{ _id: 'a1', createdAt: new Date().toISOString() }] },
    });

    const { result } = renderHook(() => useAnnounceUnread({ _id: 'u1' }));

    await waitFor(() => {
      expect(result.current[0]).toBe(false);
    });
  });

  test('clearUnread sets hasUnread to false immediately', async () => {
    localStorage.setItem(STORAGE_KEY, '0');
    apiClient.announcements.list.mockResolvedValue({
      data: { announcements: [{ _id: 'a1', createdAt: new Date().toISOString() }] },
    });

    const { result } = renderHook(() => useAnnounceUnread({ _id: 'u1' }));

    await waitFor(() => {
      expect(result.current[0]).toBe(true);
    });

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(false);
  });

  test('clearUnread available even when user is null', () => {
    const { result } = renderHook(() => useAnnounceUnread(null));
    expect(result.current[0]).toBe(false);
    expect(typeof result.current[1]).toBe('function');
  });

  test('clears unread when user becomes null', async () => {
    localStorage.setItem(STORAGE_KEY, '0');
    apiClient.announcements.list.mockResolvedValue({
      data: { announcements: [{ _id: 'a1', createdAt: new Date().toISOString() }] },
    });

    const { result, rerender } = renderHook(
      ({ user }) => useAnnounceUnread(user),
      { initialProps: { user: { _id: 'u1' } } },
    );

    await waitFor(() => {
      expect(result.current[0]).toBe(true);
    });

    rerender({ user: null });
    expect(result.current[0]).toBe(false);
  });
});
