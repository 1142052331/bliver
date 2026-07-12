import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
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

function Probe({ onUser }) {
  const auth = useAuth();
  useEffect(() => { if (auth.user) onUser(auth.user); }, [auth.user, onUser]);
  return null;
}

describe('useAuth auto-login', () => {
  test('persists the authoritative /me user snapshot without changing the token', async () => {
    const serverUser = { _id: 'user-1', name: 'alice', role: 'user', lastFootprintVisibility: 'private' };
    mocks.me.mockResolvedValueOnce({ data: { user: serverUser } });
    const onUser = vi.fn();

    render(<Probe onUser={onUser} />);

    await vi.waitFor(() => expect(onUser).toHaveBeenCalledWith(serverUser));
    expect(mocks.saveUser).toHaveBeenCalledWith(serverUser);
    expect(mocks.getToken).toHaveBeenCalled();
  });
});
