import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_KEY = 'bliver_user';
const TOKEN_KEY = 'bliver_token';
const LEGACY_KEYS = ['bliver_cred', 'bliver_autologin'];

const loadAuth = async () => {
  vi.resetModules();
  return import('../auth.js');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('auth storage', () => {
  it('purges legacy credentials and auto-login flags from both stores on import', async () => {
    for (const storage of [sessionStorage, localStorage]) {
      storage.setItem('bliver_cred', JSON.stringify({ name: 'alice', pw: 'secret' }));
      storage.setItem('bliver_autologin', '1');
    }

    const auth = await loadAuth();

    for (const storage of [sessionStorage, localStorage]) {
      for (const key of LEGACY_KEYS) {
        expect(storage.getItem(key)).toBeNull();
      }
    }
    expect(auth.saveCredentials).toBeUndefined();
    expect(auth.getCredentials).toBeUndefined();
    expect(auth.clearCredentials).toBeUndefined();
    expect(auth.setAutoLogin).toBeUndefined();
    expect(auth.isAutoLogin).toBeUndefined();
  });

  it('keeps a nonpersistent session only in sessionStorage', async () => {
    const auth = await loadAuth();
    const user = { _id: 'user-1', name: 'alice' };
    localStorage.setItem(USER_KEY, JSON.stringify({ _id: 'old-user' }));
    localStorage.setItem(TOKEN_KEY, 'old-token');

    auth.saveAuth(user, 'session-token');

    expect(sessionStorage.getItem(USER_KEY)).toBe(JSON.stringify(user));
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('session-token');
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.getUser()).toEqual(user);
    expect(auth.getToken()).toBe('session-token');
  });

  it('keeps a persistent session only in localStorage', async () => {
    const auth = await loadAuth();
    const user = { _id: 'user-2', name: 'bob' };
    sessionStorage.setItem(USER_KEY, JSON.stringify({ _id: 'old-user' }));
    sessionStorage.setItem(TOKEN_KEY, 'old-token');

    auth.saveAuth(user, 'persistent-token', { persistent: true });

    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(user));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('persistent-token');
    expect(sessionStorage.getItem(USER_KEY)).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.getUser()).toEqual(user);
    expect(auth.getToken()).toBe('persistent-token');
  });

  it('clears both session lifetimes on logout', async () => {
    const auth = await loadAuth();
    for (const storage of [sessionStorage, localStorage]) {
      storage.setItem(USER_KEY, JSON.stringify({ _id: 'user-1' }));
      storage.setItem(TOKEN_KEY, 'token');
    }

    auth.clearAuth();

    for (const storage of [sessionStorage, localStorage]) {
      expect(storage.getItem(USER_KEY)).toBeNull();
      expect(storage.getItem(TOKEN_KEY)).toBeNull();
    }
  });

  it.each([
    ['temporary', false, sessionStorage, localStorage],
    ['persistent', true, localStorage, sessionStorage],
  ])('saveUser preserves the %s session lifetime', async (_label, persistent, active, inactive) => {
    const auth = await loadAuth();
    auth.saveAuth({ _id: 'user-1', name: 'before' }, 'same-token', { persistent });

    auth.saveUser({ _id: 'user-1', name: 'after' });

    expect(JSON.parse(active.getItem(USER_KEY))).toEqual({ _id: 'user-1', name: 'after' });
    expect(active.getItem(TOKEN_KEY)).toBe('same-token');
    expect(inactive.getItem(USER_KEY)).toBeNull();
    expect(inactive.getItem(TOKEN_KEY)).toBeNull();
  });

  it('does not combine partial sessions from different stores', async () => {
    const auth = await loadAuth();
    sessionStorage.setItem(USER_KEY, JSON.stringify({ _id: 'user-1', name: 'alice' }));
    localStorage.setItem(TOKEN_KEY, 'token-from-another-store');

    expect(auth.getUser()).toBeNull();
    expect(auth.getToken()).toBeNull();

    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem(TOKEN_KEY, 'session-token');
    localStorage.setItem(USER_KEY, JSON.stringify({ _id: 'user-2', name: 'bob' }));

    expect(auth.getUser()).toBeNull();
    expect(auth.getToken()).toBeNull();
  });
});
