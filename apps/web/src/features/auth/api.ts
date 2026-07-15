import type { AuthResponse, LoginRequest, RegisterRequest, PublicUser, SessionDto } from '@bliver/contracts';
import { authResponse, publicUser, sessionDto } from '@bliver/contracts';

async function request<T>(path: string, init: RequestInit, schema: { parse: (value: unknown) => T }): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw Object.assign(new Error(body.code ?? 'REQUEST_FAILED'), { code: body.code, status: response.status }); }
  if (response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}

export const authApi = {
  session: () => request<SessionDto>('/api/v1/session', { method: 'GET' }, sessionDto),
  me: () => request<PublicUser>('/api/v1/users/me', { method: 'GET' }, publicUser),
  login: (input: LoginRequest) => request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }, authResponse),
  register: (input: RegisterRequest) => request<{ user: PublicUser }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }, { parse: (value) => ({ user: publicUser.parse((value as { user: unknown }).user) }) }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }, { parse: () => undefined }),
};
