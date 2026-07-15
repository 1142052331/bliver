import { v7 } from 'uuid';
import { createUserId, type UserId } from '@bliver/domain';
import type { IdentityRepositories, Role, SessionRecord } from './ports.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import { capacitorSessionPolicy, webSessionPolicy, createOpaqueToken, hashToken, isExpired, normalizeDeviceName, type SessionPlatform } from '../domain/session.js';

export class IdentityError extends Error { constructor(readonly code: string) { super(code); } }

export interface PublicUser { id: string; username: string; displayName: string; email: string | null; roles: readonly Role[]; }
export interface SessionGrant { user: PublicUser; session: { id: string; deviceName: string; createdAt: string; lastSeenAt: string; current: boolean }; accessToken: string; refreshToken?: string | undefined; }

function toUser(record: Awaited<ReturnType<IdentityRepositories['users']['findById']>>, roles: readonly Role[]): PublicUser {
  if (!record) throw new IdentityError('USER_NOT_FOUND');
  return { id: record.id, username: record.username, displayName: record.displayName, email: record.email, roles };
}

export async function registerUser(repos: IdentityRepositories, input: { username: string; password: string; email?: string; displayName?: string }): Promise<PublicUser> {
  const username = input.username.trim();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw new IdentityError('INVALID_USERNAME');
  if (await repos.users.findByUsername(username)) throw new IdentityError('USERNAME_TAKEN');
  const user = await repos.users.create({ id: createUserId() as UserId, username, email: input.email?.trim().toLowerCase() ?? null, displayName: input.displayName?.trim() || username });
  await repos.credentials.create({ userId: user.id, passwordHash: await hashPassword(input.password) });
  return toUser(user, await repos.roles.listByUserId(user.id));
}

export async function authenticateUser(repos: IdentityRepositories, input: { username: string; password: string; platform: SessionPlatform; deviceName?: string }): Promise<SessionGrant> {
  const user = await repos.users.findByUsername(input.username.trim());
  const credential = user ? await repos.credentials.findByUserId(user.id) : null;
  if (!user || !credential || !(await verifyPassword(credential.passwordHash, input.password))) throw new IdentityError('INVALID_CREDENTIALS');
  if (await repos.suspensions?.isSuspended(user.id)) throw new IdentityError('USER_SUSPENDED');
  const now = new Date();
  const policy = input.platform === 'web' ? webSessionPolicy : capacitorSessionPolicy;
  const access = createOpaqueToken();
  const refresh = input.platform === 'capacitor' ? createOpaqueToken() : undefined;
  const session: SessionRecord = { id: v7(), userId: user.id, deviceId: v7(), familyId: v7(), tokenHash: hashToken(access), refreshTokenHash: refresh ? hashToken(refresh) : null, expiresAt: new Date(now.getTime() + policy.accessTtlMs), createdAt: now, lastSeenAt: now, revokedAt: null };
  await repos.devices.create({ id: session.deviceId, userId: user.id, name: normalizeDeviceName(input.deviceName, input.platform), platform: input.platform });
  await repos.sessions.create(session);
  return { user: toUser(user, await repos.roles.listByUserId(user.id)), session: { id: session.id, deviceName: normalizeDeviceName(input.deviceName, input.platform), createdAt: now.toISOString(), lastSeenAt: now.toISOString(), current: true }, accessToken: access, refreshToken: refresh };
}

export async function resolveSession(repos: IdentityRepositories, rawToken: string): Promise<{ user: PublicUser; session: SessionRecord } | null> {
  const session = await repos.sessions.findByTokenHash(hashToken(rawToken));
  if (!session || session.revokedAt || isExpired(session.expiresAt)) return null;
  const user = await repos.users.findById(session.userId);
  if (user && await repos.suspensions?.isSuspended(user.id)) return null;
  return user ? { user: toUser(user, await repos.roles.listByUserId(user.id)), session } : null;
}

export async function revokeSession(repos: IdentityRepositories, sessionId: string): Promise<void> { await repos.sessions.revoke(sessionId); }

export async function rotateSession(repos: IdentityRepositories, rawRefreshToken: string, platform: SessionPlatform): Promise<SessionGrant> {
  void platform;
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await repos.sessions.findByTokenHash(tokenHash);
  if (!existing || existing.refreshTokenHash !== tokenHash) throw new IdentityError('REFRESH_INVALID');
  if (existing.revokedAt || isExpired(existing.expiresAt)) {
    await repos.sessions.revokeFamily(existing.familyId);
    await repos.securityEvents.record({ userId: existing.userId, eventType: 'refresh_replay_detected', metadata: { sessionId: existing.id } });
    throw new IdentityError('REFRESH_REPLAY');
  }
  const user = await repos.users.findById(existing.userId);
  if (!user) throw new IdentityError('USER_NOT_FOUND');
  if (await repos.suspensions?.isSuspended(user.id)) throw new IdentityError('USER_SUSPENDED');
  const now = new Date(); const accessToken = createOpaqueToken(); const refreshToken = createOpaqueToken();
  const replacement: SessionRecord = { id: v7(), userId: existing.userId, deviceId: existing.deviceId, familyId: existing.familyId, tokenHash: hashToken(accessToken), refreshTokenHash: hashToken(refreshToken), expiresAt: new Date(now.getTime() + capacitorSessionPolicy.accessTtlMs), createdAt: now, lastSeenAt: now, revokedAt: null };
  await repos.sessions.rotate(existing.id, replacement, now);
  return { user: toUser(user, await repos.roles.listByUserId(user.id)), session: { id: replacement.id, deviceName: 'Mobile device', createdAt: now.toISOString(), lastSeenAt: now.toISOString(), current: true }, accessToken, refreshToken };
}
