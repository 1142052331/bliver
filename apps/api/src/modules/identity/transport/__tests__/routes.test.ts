import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../../../bootstrap/config.js';
import { createApp } from '../../../../http/app.js';
import { createMemoryIdentityRepositories } from '../../application/memory-repositories.js';

const config = createConfig({ NODE_ENV: 'test', DEPLOY_ENV: 'test', RELEASE_SHA: 'test', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234' });

describe('identity REST transport', () => {
  it('registers, logs in with an HttpOnly cookie, reads me, and logs out', async () => {
    const repos = createMemoryIdentityRepositories();
    const app = createApp({ config, identity: repos });
    const register = await request(app).post('/api/v1/auth/register').send({ username: 'alice', password: 'password-123' });
    expect(register.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'alice', password: 'password-123', platform: 'web' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(login.body).not.toHaveProperty('accessToken');
    const cookies = (Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [String(login.headers['set-cookie'] ?? '')]).join('; ');
    const me = await request(app).get('/api/v1/users/me').set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ username: 'alice' });
    const csrf = cookies.match(/bliver_csrf=([^;]+)/)?.[1] ?? '';
    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookies).set('x-csrf-token', csrf);
    expect(logout.status).toBe(204);
  });

  it('rejects invalid credentials with a generic problem response', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    const response = await request(app).post('/api/v1/auth/login').send({ username: 'missing', password: 'wrong', platform: 'web' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(response.body)).not.toMatch(/hash|token/i);
  });

  it('returns authenticated public profiles in requested order without private account data', async () => {
    const repos = createMemoryIdentityRepositories();
    const app = createApp({ config, identity: repos });
    const alice = await request(app).post('/api/v1/auth/register').send({ username: 'alice', password: 'password-123', email: 'alice@example.com', displayName: 'Alice' });
    const bob = await request(app).post('/api/v1/auth/register').send({ username: 'bob', password: 'password-123', email: 'bob@example.com', displayName: 'Bob' });
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'alice', password: 'password-123', platform: 'web' });
    const cookies = (Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [String(login.headers['set-cookie'] ?? '')]).join('; ');

    const response = await request(app)
      .get(`/api/v1/users?ids=${bob.body.user.id},${alice.body.user.id},${bob.body.user.id}`)
      .set('Cookie', cookies);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        { id: bob.body.user.id, username: 'bob', displayName: 'Bob' },
        { id: alice.body.user.id, username: 'alice', displayName: 'Alice' },
      ],
    });
    expect(JSON.stringify(response.body)).not.toMatch(/email|roles|password|token/i);
  });

  it('filters inaccessible profiles while preserving order and duplicate removal', async () => {
    const repos = createMemoryIdentityRepositories();
    let deniedId = '';
    const app = createApp({
      config,
      identity: repos,
      identityProfileAccess: {
        async canAccess(_actorId, targetId) { return targetId !== deniedId; },
      },
    });
    const alice = await request(app).post('/api/v1/auth/register').send({ username: 'alice', password: 'password-123', displayName: 'Alice' });
    const bob = await request(app).post('/api/v1/auth/register').send({ username: 'bob', password: 'password-123', displayName: 'Bob' });
    const charlie = await request(app).post('/api/v1/auth/register').send({ username: 'charlie', password: 'password-123', displayName: 'Charlie' });
    deniedId = String(bob.body.user.id);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'alice', password: 'password-123', platform: 'web' });
    const cookies = (Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [String(login.headers['set-cookie'] ?? '')]).join('; ');

    const filtered = await request(app)
      .get(`/api/v1/users?ids=${charlie.body.user.id},${bob.body.user.id},${alice.body.user.id},${charlie.body.user.id}`)
      .set('Cookie', cookies);

    expect(filtered.status).toBe(200);
    expect(filtered.body).toEqual({
      items: [
        { id: charlie.body.user.id, username: 'charlie', displayName: 'Charlie' },
        { id: alice.body.user.id, username: 'alice', displayName: 'Alice' },
      ],
    });

    const anonymous = await request(app).get(`/api/v1/users?ids=${bob.body.user.id}`);
    expect(anonymous.status).toBe(200);
    expect(anonymous.body).toEqual({
      items: [{ id: bob.body.user.id, username: 'bob', displayName: 'Bob' }],
    });
  });

  it('allows public profile reads and validates the batch endpoint', async () => {
    const repos = createMemoryIdentityRepositories();
    const app = createApp({ config, identity: repos });
    const unauthenticated = await request(app).get('/api/v1/users?ids=019c2f52-3e9b-7d1f-8d68-cf35d75d9b70');
    expect(unauthenticated.status).toBe(200);
    expect(unauthenticated.body).toEqual({ items: [] });

    const invalid = await request(app).get('/api/v1/users?ids=not-a-user-id');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_REQUEST');
  });
});
