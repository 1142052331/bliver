import axios from 'axios';
import { getToken, getUser, clearAuth } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

// ── JWT identity guard: detect cross-tab token pollution ──
let lastMismatch = 0; // throttle to prevent reload loops

api.interceptors.request.use((config) => {
  const token = getToken();
  if (!token) return config;

  config.headers.Authorization = `Bearer ${token}`;

  // Verify JWT payload matches stored user identity
  const user = getUser();
  if (user?._id) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id && payload.id !== user._id) {
        // Token belongs to a different user — localStorage polluted by another tab
        console.warn('[api] Token/user mismatch — clearing stale session');
        clearAuth();
        // Throttle: only reload once per 2 seconds
        if (Date.now() - lastMismatch > 2000) {
          lastMismatch = Date.now();
          window.location.reload();
        }
        throw new axios.Cancel('Session mismatch');
      }
    } catch (e) {
      if (e instanceof axios.Cancel) throw e;
      // JWT parse failure — ignore, let the server reject it
    }
  }

  config.headers['X-User-Id'] = user?._id || '';
  return config;
});

export default api;
