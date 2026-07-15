import { describe, expect, it } from 'vitest';
import { createMemoryIdentityRepositories } from '../memory-repositories.js';
import { authenticateUser, IdentityError, registerUser, resolveSession, rotateSession } from '../commands.js';

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
});
