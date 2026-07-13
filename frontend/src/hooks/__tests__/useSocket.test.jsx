import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import useSocket from '../useSocket';

const mocks = vi.hoisted(() => {
  const socket = {
    id: 'socket-1',
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    socket,
    io: vi.fn(() => socket),
    list: vi.fn(),
  };
});

vi.mock('socket.io-client', () => ({ io: mocks.io }));
vi.mock('../../api', () => ({
  apiClient: {
    notifications: {
      list: mocks.list,
      markRead: vi.fn(() => Promise.resolve()),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('bliver_user', JSON.stringify({ _id: 'user-1', name: 'alice' }));
  localStorage.setItem('bliver_token', 'token');
});

it('aborts the initial notification request when the socket effect cleans up', async () => {
  let requestSignal;
  mocks.list.mockImplementation((opts) => {
    requestSignal = opts?.signal;
    return new Promise(() => {});
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { unmount } = renderHook(() => useSocket({
    user: { _id: 'user-1' },
    setUser: vi.fn(),
    setFootprints: vi.fn(),
    setNotifications: vi.fn(),
    appendNotification: vi.fn(),
    applyServerNotifications: vi.fn(),
    captureNotificationRequest: vi.fn(() => ({
      userId: 'user-1',
      sessionGeneration: 0,
      socketSequence: 0,
    })),
    setOnlineCount: vi.fn(),
  }), { wrapper });

  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  expect(requestSignal).toBeInstanceOf(AbortSignal);
  expect(requestSignal.aborted).toBe(false);

  unmount();

  expect(requestSignal.aborted).toBe(true);
});
