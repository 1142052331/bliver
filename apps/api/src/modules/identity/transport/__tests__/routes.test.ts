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
});
