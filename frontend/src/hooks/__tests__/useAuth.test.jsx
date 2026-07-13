import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useAuth from '../useAuth';

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  getUser: vi.fn(() => ({ _id: 'user-1', lastFootprintVisibility: 'public' })),
  getToken: vi.fn(() => 'token'),
  saveUser: vi.fn(),
  clearAuth: vi.fn(),
  isAutoLogin: vi.fn(() => true),
  subscribeToPush: vi.fn(async () => {}),
}));

vi.mock('../../api', () => ({ apiClient: { auth: { me: mocks.me } } }));
vi.mock('../../auth', () => ({
  getUser: mocks.getUser,
  getToken: mocks.getToken,
  saveUser: mocks.saveUser,
  clearAuth: mocks.clearAuth,
  isAutoLogin: mocks.isAutoLogin,
}));
vi.mock('../../authSync', () => ({
  broadcastLogout: vi.fn(),
  listenAuthSync: vi.fn(() => () => {}),
}));
vi.mock('../../push', () => ({ subscribeToPush: mocks.subscribeToPush }));
vi.mock('../../store/useUIStore', () => ({ default: (selector) => selector({
  openCheckIn: vi.fn(),
  setActiveFootprintId: vi.fn(),
  openAuth: vi.fn(),
  setAuthMessage: vi.fn(),
  setAuthTab: vi.fn(),
}) }));

function Probe({ onUser, onAuth }) {
  const auth = useAuth();
  useEffect(() => { if (auth.user) onUser(auth.user); }, [auth.user, onUser]);
  useEffect(() => { onAuth?.(auth); }, [auth, onAuth]);
  return null;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useAuth auto-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockReturnValue({ _id: 'user-1', lastFootprintVisibility: 'public' });
    mocks.getToken.mockReturnValue('token-a');
    mocks.isAutoLogin.mockReturnValue(true);
  });

  test('persists the authoritative /me user snapshot without changing the token', async () => {
    const serverUser = { _id: 'user-1', name: 'alice', role: 'user', lastFootprintVisibility: 'private' };
    mocks.me.mockResolvedValueOnce({ data: { user: serverUser } });
    const onUser = vi.fn();

    render(<Probe onUser={onUser} />);

    await vi.waitFor(() => expect(onUser).toHaveBeenCalledWith(serverUser));
    expect(mocks.saveUser).toHaveBeenCalledWith(serverUser);
    expect(mocks.getToken).toHaveBeenCalled();
  });

  test('does not let a stale /me success overwrite a newer local session', async () => {
    const requestA = deferred();
    mocks.me.mockReturnValueOnce(requestA.promise);
    const onUser = vi.fn();
    let auth;
    render(<Probe onUser={onUser} onAuth={(value) => { auth = value; }} />);

    const userB = { _id: 'user-2', name: 'bob', role: 'user' };
    mocks.getToken.mockReturnValue('token-b');
    mocks.getUser.mockReturnValue(userB);
    await act(async () => auth.setUser(userB));

    await act(async () => requestA.resolve({ data: { user: { _id: 'user-1', name: 'alice', role: 'user' } } }));

    expect(onUser).toHaveBeenLastCalledWith(userB);
    expect(mocks.saveUser).not.toHaveBeenCalled();
    expect(mocks.subscribeToPush).not.toHaveBeenCalled();
  });

  test('does not let a stale /me error clear a newer local session', async () => {
    const requestA = deferred();
    mocks.me.mockReturnValueOnce(requestA.promise);
    const onUser = vi.fn();
    let auth;
    render(<Probe onUser={onUser} onAuth={(value) => { auth = value; }} />);

    const userB = { _id: 'user-2', name: 'bob', role: 'user' };
    mocks.getToken.mockReturnValue('token-b');
    mocks.getUser.mockReturnValue(userB);
    await act(async () => auth.setUser(userB));
    await act(async () => requestA.reject(new Error('session A expired')));

    expect(onUser).toHaveBeenLastCalledWith(userB);
    expect(mocks.clearAuth).not.toHaveBeenCalled();
  });

  test('aborts the pending /me request on unmount without clearing auth', async () => {
    let requestSignal;
    mocks.me.mockImplementationOnce(({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    });

    const view = render(<Probe onUser={vi.fn()} />);
    view.unmount();

    expect(requestSignal.aborted).toBe(true);
    expect(mocks.clearAuth).not.toHaveBeenCalled();
  });
});

describe('useAuth pending conversation restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockReturnValue(null);
    mocks.getToken.mockReturnValue(null);
    mocks.isAutoLogin.mockReturnValue(false);
  });

  test('restores the exact reply target and draft without submitting it', async () => {
    let auth;
    render(<Probe onUser={vi.fn()} onAuth={(value) => { auth = value; }} />);
    const action = {
      type: 'reply',
      footprintId: 'fp-1',
      targetId: 'comment-1',
      targetType: 'comment',
      draft: '继续聊',
      source: 'activity',
    };

    act(() => auth.requireLogin(action));
    expect(auth.pendingActionRef.current).toEqual(action);

    await act(async () => auth.setUser({ _id: 'user-1', name: 'alice', role: 'user' }));
    await vi.waitFor(() => expect(auth.restoredAction).toEqual(action));
    expect(auth.pendingActionRef.current).toBeNull();

    let consumed;
    act(() => { consumed = auth.consumePendingAction(); });
    expect(consumed).toEqual(action);
    await vi.waitFor(() => expect(auth.restoredAction).toBeNull());
  });
});
