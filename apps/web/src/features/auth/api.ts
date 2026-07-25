import type { AuthResponse, LoginRequest, RegisterRequest, PublicUser } from '@bliver/contracts';
import { authResponse, publicUser } from '@bliver/contracts';
import { fetchSession } from './session-api.js';

async function request<T>(path: string, init: RequestInit, schema: { parse: (value: unknown) => T }): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw Object.assign(new Error(body.code ?? 'REQUEST_FAILED'), { code: body.code, status: response.status }); }
  if (response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}

export const authApi = {
  session: fetchSession,
  me: () => request<PublicUser>('/api/v1/users/me', { method: 'GET' }, publicUser),
  login: (input: LoginRequest) => request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }, authResponse),
  register: (input: RegisterRequest) => request<AuthResponse>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }, authResponse),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }, { parse: () => undefined }),
};
