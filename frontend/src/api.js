import axios from 'axios';
import { getToken, getUser } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Attach current user identity header for cross-verification
  const user = getUser();
  if (user?._id) config.headers['X-User-Id'] = user._id;
  return config;
});

export default api;
