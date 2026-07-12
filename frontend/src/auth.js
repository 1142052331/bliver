const TOKEN_KEY = 'bliver_token';
const USER_KEY = 'bliver_user';
const CRED_KEY = 'bliver_cred';
const AUTOLOGIN_KEY = 'bliver_autologin';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
};

export const saveAuth = (user, token) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, token);
};

// Keep the server-authoritative user snapshot in sync without affecting auth state.
export const saveUser = (user) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage may be blocked or full; in-memory auth remains valid.
  }
};

export const clearAuth = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

// Remember credentials (base64 obfuscated — not truly secure)
export const saveCredentials = (name, password) => {
  if (!name || !password) return;
  localStorage.setItem(CRED_KEY, JSON.stringify({ name, pw: btoa(password) }));
};

export const getCredentials = () => {
  try {
    const data = JSON.parse(localStorage.getItem(CRED_KEY));
    return data ? { name: data.name, password: atob(data.pw) } : null;
  } catch { return null; }
};

export const clearCredentials = () => {
  localStorage.removeItem(CRED_KEY);
};

// Auto-login toggle
export const setAutoLogin = (enabled) => {
  if (enabled) localStorage.setItem(AUTOLOGIN_KEY, '1');
  else localStorage.removeItem(AUTOLOGIN_KEY);
};

export const isAutoLogin = () => localStorage.getItem(AUTOLOGIN_KEY) === '1';

// Timeline period preference
const PERIOD_KEY = 'bliver_period';
export const getPeriod = () => {
  const v = localStorage.getItem(PERIOD_KEY);
  return (v === 'today' || v === 'week' || v === 'year') ? v : 'year';
};
export const setPeriod = (period) => localStorage.setItem(PERIOD_KEY, period);
