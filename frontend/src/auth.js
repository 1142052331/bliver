const TOKEN_KEY = 'bliver_token';
const USER_KEY = 'bliver_user';
const CRED_KEY = 'bliver_cred';
const AUTOLOGIN_KEY = 'bliver_autologin';

const getStores = () => {
  if (typeof window === 'undefined') return [];
  return [window.sessionStorage, window.localStorage];
};

for (const storage of getStores()) {
  storage.removeItem(CRED_KEY);
  storage.removeItem(AUTOLOGIN_KEY);
}

const parseUser = (value) => {
  if (!value) return null;
  try {
    const user = JSON.parse(value);
    return user && typeof user === 'object' && !Array.isArray(user) ? user : null;
  } catch {
    return null;
  }
};

const readPair = (storage) => {
  const token = storage.getItem(TOKEN_KEY);
  const user = parseUser(storage.getItem(USER_KEY));
  return token && user ? { storage, token, user } : null;
};

const getActivePair = () => {
  for (const storage of getStores()) {
    const pair = readPair(storage);
    if (pair) return pair;
  }
  return null;
};

export const getToken = () => getActivePair()?.token ?? null;

export const getUser = () => getActivePair()?.user ?? null;

export const saveAuth = (user, token, { persistent = false } = {}) => {
  clearAuth();
  const storage = getStores()[persistent ? 1 : 0];
  if (!storage) return;
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem(TOKEN_KEY, token);
};

// Keep the server-authoritative user snapshot in the active session store.
export const saveUser = (user) => {
  const pair = getActivePair();
  if (!pair) return;
  try {
    pair.storage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage may be blocked or full; in-memory auth remains valid.
  }
};

export const clearAuth = () => {
  for (const storage of getStores()) {
    storage.removeItem(USER_KEY);
    storage.removeItem(TOKEN_KEY);
  }
};

// Timeline period preference
const PERIOD_KEY = 'bliver_period';
export const getPeriod = () => {
  const v = getStores()[1]?.getItem(PERIOD_KEY);
  return (v === 'today' || v === 'week' || v === 'year') ? v : 'year';
};
export const setPeriod = (period) => getStores()[1]?.setItem(PERIOD_KEY, period);
