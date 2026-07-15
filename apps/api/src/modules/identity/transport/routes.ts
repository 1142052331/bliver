import { Router, type Request, type Response, type NextFunction } from 'express';
import { registerRequest, loginRequest, refreshRequest } from '@bliver/contracts';
import type { ApiConfig } from '../../../bootstrap/config.js';
import { authenticateUser, IdentityError, registerUser, resolveSession, revokeSession, rotateSession } from '../application/commands.js';
import type { IdentityRepositories, Role } from '../application/ports.js';

export interface ActorContext { readonly userId: string; readonly sessionId: string; readonly roles: readonly Role[]; readonly transport: 'cookie' | 'bearer'; }

function parseCookies(request: Request): Record<string, string> {
  const header = request.get('cookie') ?? '';
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=', 2) as [string, string | undefined]).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value ?? '')]));
}

function setSessionCookie(response: Response, token: string): void {
  const csrf = Math.random().toString(36).slice(2);
  response.setHeader('set-cookie', [`bliver_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`, `bliver_csrf=${csrf}; Path=/; SameSite=Lax`]);
}

function clearSessionCookie(response: Response): void { response.setHeader('set-cookie', ['bliver_session=; Path=/; HttpOnly; Max-Age=0', 'bliver_csrf=; Path=/; Max-Age=0']); }

function sameOrigin(request: Request): boolean {
  const origin = request.get('origin');
  if (!origin) return true;
  try { const url = new URL(origin); return url.hostname === 'localhost' || url.hostname === '127.0.0.1'; } catch { return false; }
}

function validCookieCsrf(request: Request): boolean {
  const cookies = parseCookies(request);
  const token = request.get('x-csrf-token');
  return Boolean(cookies.bliver_csrf && token && token === cookies.bliver_csrf);
}

function problem(response: Response, status: number, code: string, request: Request): void {
  response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : 'Bad request', status, code, requestId: request.id });
}

function publicSession(grant: { session: { id: string; deviceName: string; createdAt: string; lastSeenAt: string; current: boolean } }) { return grant.session; }

export function requireActor(repos: IdentityRepositories) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const cookies = parseCookies(request);
    const bearer = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer ?? cookies.bliver_session;
    if (!token) { problem(response, 401, 'AUTH_REQUIRED', request); return; }
    const resolved = await resolveSession(repos, token);
    if (!resolved) { problem(response, 401, 'SESSION_INVALID', request); return; }
    (request as Request & { actor?: ActorContext }).actor = { userId: resolved.user.id, sessionId: resolved.session.id, roles: resolved.user.roles, transport: bearer ? 'bearer' : 'cookie' };
    next();
  };
}

export function identityRouter(repos: IdentityRepositories, config: ApiConfig): Router {
  void config;
  const router = Router();
  const actor = requireActor(repos);
  const attempts = new Map<string, { count: number; at: number }>();
  const rateLimit = (request: Request, response: Response, next: NextFunction): void => {
    const key = `${request.ip}:${request.body?.username ?? ''}`;
    const now = Date.now(); const current = attempts.get(key);
    if (current && now - current.at < 60_000 && current.count >= 10) { problem(response, 429, 'RATE_LIMITED', request); return; }
    attempts.set(key, current && now - current.at < 60_000 ? { count: current.count + 1, at: current.at } : { count: 1, at: now }); next();
  };
  router.post('/auth/register', rateLimit, async (request, response) => {
    if (!sameOrigin(request)) { problem(response, 403, 'CSRF_ORIGIN_INVALID', request); return; }
    const parsed = registerRequest.safeParse(request.body);
    if (!parsed.success) { problem(response, 400, 'INVALID_REQUEST', request); return; }
    try { await registerUser(repos, { username: parsed.data.username, password: parsed.data.password, ...(parsed.data.email ? { email: parsed.data.email } : {}), ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}) }); const grant = await authenticateUser(repos, { username: parsed.data.username, password: parsed.data.password, platform: 'web' }); setSessionCookie(response, grant.accessToken); response.status(201).json({ user: grant.user, session: publicSession(grant) }); } catch (error) { const code = error instanceof IdentityError ? error.code : 'INVALID_REQUEST'; problem(response, code === 'USERNAME_TAKEN' ? 409 : 400, code, request); }
  });
  router.post('/auth/login', rateLimit, async (request, response) => {
    if (!sameOrigin(request)) { problem(response, 403, 'CSRF_ORIGIN_INVALID', request); return; }
    const parsed = loginRequest.safeParse(request.body);
    if (!parsed.success) { problem(response, 400, 'INVALID_REQUEST', request); return; }
    try { const grant = await authenticateUser(repos, { username: parsed.data.username, password: parsed.data.password, platform: parsed.data.platform, ...(parsed.data.deviceName ? { deviceName: parsed.data.deviceName } : {}) }); if (parsed.data.platform === 'web') setSessionCookie(response, grant.accessToken); response.status(200).json({ user: grant.user, session: publicSession(grant), ...(parsed.data.platform === 'capacitor' ? { accessToken: grant.accessToken, ...(grant.refreshToken ? { refreshToken: grant.refreshToken } : {}) } : {}) }); } catch (error) { problem(response, 401, error instanceof IdentityError ? error.code : 'INVALID_CREDENTIALS', request); }
  });
  router.post('/auth/refresh', async (request, response) => {
    const parsed = refreshRequest.safeParse(request.body);
    if (!parsed.success) { problem(response, 401, 'REFRESH_INVALID', request); return; }
    try { const grant = await rotateSession(repos, parsed.data.refreshToken, 'capacitor'); response.json({ accessToken: grant.accessToken, refreshToken: grant.refreshToken, session: grant.session, user: grant.user }); } catch (error) { problem(response, 401, error instanceof IdentityError ? error.code : 'REFRESH_INVALID', request); }
  });
  router.post('/auth/logout', actor, async (request, response) => { const context = (request as Request & { actor: ActorContext }).actor; if (!sameOrigin(request) || (context.transport === 'cookie' && !validCookieCsrf(request))) { problem(response, 403, 'CSRF_ORIGIN_INVALID', request); return; } await revokeSession(repos, context.sessionId); clearSessionCookie(response); response.status(204).end(); });
  router.get('/session', actor, async (request, response) => { const context = (request as Request & { actor: ActorContext }).actor; const session = await repos.sessions.findById(context.sessionId); if (!session) { problem(response, 401, 'SESSION_INVALID', request); return; } response.json({ id: session.id, deviceName: 'Current device', createdAt: session.createdAt.toISOString(), lastSeenAt: session.lastSeenAt.toISOString(), current: true }); });
  router.get('/users/me', actor, async (request, response) => { const context = (request as Request & { actor: ActorContext }).actor; const user = await repos.users.findById(context.userId as never); if (!user) { problem(response, 404, 'USER_NOT_FOUND', request); return; } response.json({ id: user.id, username: user.username, displayName: user.displayName, email: user.email, roles: await repos.roles.listByUserId(user.id) }); });
  router.get('/sessions', actor, async (request, response) => { const context = (request as Request & { actor: ActorContext }).actor; const sessions = await repos.sessions.listByUserId(context.userId as never); response.json({ sessions: sessions.filter((s) => !s.revokedAt).map((s) => ({ id: s.id, deviceName: 'Device', createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === context.sessionId })) }); });
  router.delete('/sessions/:sessionId', actor, async (request, response) => { const context = (request as Request & { actor: ActorContext }).actor; if (!sameOrigin(request) || (context.transport === 'cookie' && !validCookieCsrf(request))) { problem(response, 403, 'CSRF_ORIGIN_INVALID', request); return; } const sessionId = String(request.params.sessionId); const target = await repos.sessions.findById(sessionId); if (!target || target.userId !== context.userId) { problem(response, 404, 'SESSION_NOT_FOUND', request); return; } await revokeSession(repos, target.id); response.status(204).end(); });
  return router;
}
