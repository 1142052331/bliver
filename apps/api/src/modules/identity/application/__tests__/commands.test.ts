import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { parseUserId } from '@bliver/domain';
import { createMemoryIdentityRepositories } from '../memory-repositories.js';
import { authenticateUser, IdentityError, registerUser, resolveSession, rotateSession } from '../commands.js';

async function seedLegacyPassword(repos: ReturnType<typeof createMemoryIdentityRepositories>, username = 'legacy', password = 'short') {
  const user = await registerUser(repos, { username, password: 'temporary-password' });
  const userId = parseUserId(user.id);
  const current = await repos.credentials.findByUserId(userId);
  const legacy = await bcrypt.hash(password, 10);
  await repos.credentials.replaceHash(userId, current!.passwordHash, legacy);
  return { user, userId, legacy };
}

describe('identity commands', () => {
  it('registers a public user without returning a password hash', async () => {
    const repos = createMemoryIdentityRepositories();
    const user = await registerUser(repos, { username: 'alice', password: 'password-123' });
    expect(user).toMatchObject({ username: 'alice', roles: ['user'] });
    expect(JSON.stringify(user)).not.toContain('argon2');
  });
  it('rejects duplicate usernames and invalid credentials generically', async () => {
    const repos = createMemoryIdentityRepositories();
    await registerUser(repos, { username: 'alice', password: 'password-123' });
    await expect(registerUser(repos, { username: 'alice', password: 'password-123' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    await expect(authenticateUser(repos, { username: 'alice', password: 'bad', platform: 'web' })).rejects.toBeInstanceOf(IdentityError);
  });
  it('resolves only active sessions by the raw token', async () => {
    const repos = createMemoryIdentityRepositories();
    await registerUser(repos, { username: 'alice', password: 'password-123' });
    const grant = await authenticateUser(repos, { username: 'alice', password: 'password-123', platform: 'web' });
    expect((await resolveSession(repos, grant.accessToken))?.user.username).toBe('alice');
    expect(await resolveSession(repos, 'not-a-token')).toBeNull();
  });
  it('rotates refresh tokens and revokes the family on replay', async () => {
    const repos = createMemoryIdentityRepositories();
    await registerUser(repos, { username: 'alice', password: 'password-123' });
    const grant = await authenticateUser(repos, { username: 'alice', password: 'password-123', platform: 'capacitor' });
    const rotated = await rotateSession(repos, grant.refreshToken as string, 'capacitor');
    expect(rotated.refreshToken).toBeTruthy();
    await expect(rotateSession(repos, grant.refreshToken as string, 'capacitor')).rejects.toMatchObject({ code: 'REFRESH_REPLAY' });
  });
  it('prevents suspended users from signing in or resolving an existing session', async () => {
    const base = createMemoryIdentityRepositories(); const suspended = new Set<string>(); const repos = { ...base, suspensions: { async isSuspended(userId: string) { return suspended.has(userId); } } };
    const user = await registerUser(repos, { username: 'suspended', password: 'password-123' });
    const grant = await authenticateUser(repos, { username: 'suspended', password: 'password-123', platform: 'web' }); suspended.add(user.id);
    await expect(resolveSession(repos, grant.accessToken)).resolves.toBeNull();
    await expect(authenticateUser(repos, { username: 'suspended', password: 'password-123', platform: 'web' })).rejects.toMatchObject({ code: 'USER_SUSPENDED' });
  });

  it('CAS-upgrades bcrypt before creating the normal V2 session', async () => {
    const repos = createMemoryIdentityRepositories();
    const { userId, legacy } = await seedLegacyPassword(repos);
    const grant = await authenticateUser(repos, { username: 'legacy', password: 'short', platform: 'web' });
    const upgraded = await repos.credentials.findByUserId(userId);
    expect(grant.user.username).toBe('legacy');
    expect(upgraded?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(upgraded?.passwordHash).not.toBe(legacy);
    expect(await repos.sessions.listByUserId(userId)).toHaveLength(1);
  });

  it('does not upgrade or create a session for a wrong legacy password', async () => {
    const repos = createMemoryIdentityRepositories();
    const { userId, legacy } = await seedLegacyPassword(repos);
    await expect(authenticateUser(repos, { username: 'legacy', password: 'wrong', platform: 'web' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((await repos.credentials.findByUserId(userId))?.passwordHash).toBe(legacy);
    expect(await repos.sessions.listByUserId(userId)).toEqual([]);
  });

  it('accepts a concurrent CAS winner only after verifying its Argon2id hash', async () => {
    const base = createMemoryIdentityRepositories();
    const { user, userId } = await seedLegacyPassword(base);
    const replacement = await import('../../domain/password.js').then(({ hashVerifiedLegacyPassword }) => hashVerifiedLegacyPassword('short'));
    const credentials = {
      ...base.credentials,
      async replaceHash(candidateUserId: typeof userId, expected: string, next: string) {
        await base.credentials.replaceHash(candidateUserId, expected, replacement);
        void next;
        return false;
      },
    };
    const grant = await authenticateUser({ ...base, credentials }, { username: 'legacy', password: 'short', platform: 'web' });
    expect(grant.user.id).toBe(user.id);
    expect((await base.credentials.findByUserId(userId))?.passwordHash).toBe(replacement);
  });

  it('creates no session when the credential CAS fails with a database error', async () => {
    const base = createMemoryIdentityRepositories();
    const { userId } = await seedLegacyPassword(base);
    const credentials = { ...base.credentials, async replaceHash() { throw new Error('database unavailable'); } };
    await expect(authenticateUser({ ...base, credentials }, { username: 'legacy', password: 'short', platform: 'web' }))
      .rejects.toThrow('database unavailable');
    expect(await base.sessions.listByUserId(userId)).toEqual([]);
  });
});
