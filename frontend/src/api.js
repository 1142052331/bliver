import axios from 'axios';
import { getToken } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// ── Resource-grouped API client ──

function qs(base, query) {
  const p = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export const apiClient = {
  footprints: {
    list({ period, userId } = {}, opts) {
      return api.get(qs('/api/footprints/today', { period, userId }), opts);
    },
    get(id, opts) { return api.get(`/api/footprints/${id}`, opts); },
    checkin(data) { return api.post('/api/checkin', data); },
    react(id, emoji) { return api.post(`/api/footprints/${id}/react`, { emoji }); },
    comment(id, content) { return api.post(`/api/footprints/${id}/comment`, { content }); },
    delete(id) { return api.delete(`/api/footprints/${id}`); },
    deleteComment(footprintId, commentId) {
      return api.delete(`/api/footprints/${footprintId}/comments/${commentId}`);
    },
  },

  auth: {
    me(opts) { return api.get('/api/auth/me', opts); },
    register(data) { return api.post('/api/auth/register', data); },
    login(data) { return api.post('/api/auth/login', data); },
  },

  users: {
    profile(id, opts) { return api.get(`/api/users/${id}/profile`, opts); },
    updateProfile(data) { return api.put('/api/users/profile', data); },
    updateBanner(data) { return api.post('/api/users/profile/banner', data); },
    comment(id, content) { return api.post(`/api/users/${id}/profile/comment`, { content }); },
    react(id, emoji) { return api.post(`/api/users/${id}/profile/react`, { emoji }); },
  },

  friends: {
    list(opts) { return api.get('/api/friends', opts); },
    requests(opts) { return api.get('/api/friends/requests', opts); },
    sendRequest(userId) { return api.post(`/api/friends/request/${userId}`); },
    accept(id) { return api.post(`/api/friends/accept/${id}`); },
    reject(id) { return api.post(`/api/friends/reject/${id}`); },
    remove(userId) { return api.delete(`/api/friends/${userId}`); },
  },

  messages: {
    history(friendId, before, opts) {
      const q = before ? `?before=${before}` : '';
      return api.get(`/api/messages/${friendId}${q}`, opts);
    },
    send(friendId, content) { return api.post(`/api/messages/${friendId}`, { content }); },
  },

  notifications: {
    list(opts) { return api.get('/api/notifications', opts); },
    markRead(id) { return api.put(`/api/notifications/${id}/read`); },
  },

  announcements: {
    list(opts) { return api.get('/api/announcements', opts); },
    create(data) { return api.post('/api/announcements', data); },
  },

  feedback: {
    submit(data) { return api.post('/api/feedback', data); },
  },

  admin: {
    online(opts) { return api.get('/api/admin/online', opts); },
    users(opts) { return api.get('/api/admin/users', opts); },
    clones(opts) { return api.get('/api/admin/clones', opts); },
    kick(userId) { return api.post(`/api/admin/kick/${userId}`); },
    deleteUser(userId) { return api.delete(`/api/admin/users/${userId}`); },
    updateUser(userId, data) { return api.put(`/api/admin/users/${userId}`, data); },
    audit({ limit, before } = {}, opts) {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (before) params.set('before', before);
      const qs = params.toString();
      return api.get(`/api/admin/audit${qs ? '?' + qs : ''}`, opts);
    },
    feedback(opts) { return api.get('/api/admin/feedback', opts); },
  },

  push: {
    vapidKey(opts) { return api.get('/api/push/vapid-public-key', opts); },
    subscribe(data) { return api.post('/api/push/subscribe', data); },
    unsubscribe(data) { return api.post('/api/push/unsubscribe', data); },
  },
};
