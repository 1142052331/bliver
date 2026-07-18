import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../../bootstrap/config.js';
import { createApp } from '../app.js';
import { createMemoryIdentityRepositories } from '../../modules/identity/application/memory-repositories.js';

const testConfig = createConfig({
  NODE_ENV: 'test', DEPLOY_ENV: 'test', RELEASE_SHA: 'security-test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'security-test-session-secret-long-enough',
});
const productionConfig = createConfig({
  NODE_ENV: 'production', DEPLOY_ENV: 'production', RELEASE_SHA: 'a'.repeat(40),
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'security-production-session-secret-long-enough',
});

function cookies(response: request.Response): string {
  const header = response.headers['set-cookie'];
  return (Array.isArray(header) ? header : [String(header ?? '')]).join('; ');
}

function cspSources(policy: string, directive: string): string[] {
  const entry = policy
    .split(';')
    .map((value) => value.trim())
    .find((value) => value === directive || value.startsWith(`${directive} `));
  return entry?.split(/\s+/).slice(1) ?? [];
}

describe('V2 production security policies', () => {
  it('sets production session cookies with HttpOnly, Secure and SameSite', async () => {
    const response = await request(createApp({ config: productionConfig }))
      .post('/api/v1/auth/register')
      .send({ username: 'secure_cookie', password: 'password-123' });
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('HttpOnly'));
    expect(response.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('Secure'));
    expect(response.headers['set-cookie']?.[0]).toEqual(expect.stringContaining('SameSite=Lax'));
  });

  it('enforces origin and double-submit CSRF on cookie mutations including media', async () => {
    const identity = createMemoryIdentityRepositories();
    const app = createApp({ config: testConfig, identity });
    const registration = await request(app).post('/api/v1/auth/register').send({ username: 'csrf_user', password: 'password-123' });
    const cookie = cookies(registration);
    const csrf = cookie.match(/bliver_csrf=([^;]+)/)?.[1] ?? '';
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).expect(403);
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('x-csrf-token', csrf).set('origin', 'https://evil.example').expect(403);
    await request(app).post('/api/v1/media/signature').set('Cookie', cookie).set('idempotency-key', 'media-csrf').send({ mimeType: 'image/jpeg', bytes: 100 }).expect(403);
    const oversized = await request(app).post('/api/v1/media/signature').set('Cookie', cookie).set('x-csrf-token', csrf).set('idempotency-key', 'media-size').send({ mimeType: 'image/jpeg', bytes: 10 * 1024 * 1024 + 1 });
    expect(oversized.status).toBe(400);
    expect(oversized.body.code).toBe('MEDIA_SIZE_INVALID');
  });

  it('keeps CORS closed, emits CSP and reports oversized JSON as 413', async () => {
    const app = createApp({ config: testConfig });
    const health = await request(app).get('/healthz').set('origin', 'https://evil.example');
    expect(health.headers['access-control-allow-origin']).toBeUndefined();
    expect(health.headers['access-control-allow-credentials']).toBeUndefined();
    const policy = String(health.headers['content-security-policy']);
    expect(cspSources(policy, 'default-src')).toEqual(["'self'"]);
    expect(cspSources(policy, 'connect-src')).toEqual([
      "'self'",
      'https://api.cloudinary.com',
      'https://tiles.openfreemap.org',
    ]);
    expect(cspSources(policy, 'img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://res.cloudinary.com',
      'https://tiles.openfreemap.org',
    ]);
    expect(cspSources(policy, 'worker-src')).toEqual(["'self'", 'blob:']);
    expect(cspSources(policy, 'style-src')).toEqual(["'self'"]);
    expect(cspSources(policy, 'style-src-attr')).toEqual(["'unsafe-inline'"]);
    expect(cspSources(policy, 'font-src')).toEqual(["'self'", 'data:']);
    expect(policy).not.toContain('https://*.tile.openstreetmap.org');
    const tooLarge = await request(app).post('/api/v1/auth/register').set('content-type', 'application/json').send(JSON.stringify({ username: 'large_body', password: 'x'.repeat(1_100_000) }));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rate limits repeated identity attempts without reflecting credentials', async () => {
    const app = createApp({ config: testConfig });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/v1/auth/login').send({ username: 'rate_user', password: 'incorrect', platform: 'web' }).expect(401);
    }
    const limited = await request(app).post('/api/v1/auth/login').send({ username: 'rate_user', password: 'incorrect', platform: 'web' });
    expect(limited.status).toBe(429);
    expect(JSON.stringify(limited.body)).not.toContain('incorrect');
  });

  it('redacts credentials, message bodies and precise coordinates from request logs', async () => {
    const chunks: string[] = [];
    const destination = new Writable({ write(chunk, _encoding, callback) { chunks.push(String(chunk)); callback(); } });
    const logger = pino({ level: 'info' }, destination);
    await request(createApp({ config: testConfig, logger }))
      .post('/api/v1/auth/login?latitude=31.234567&longitude=121.456789')
      .set('authorization', 'Bearer phase7-sensitive-token')
      .set('cookie', 'bliver_session=phase7-sensitive-cookie')
      .send({ username: 'log_user', password: 'phase7-sensitive-password', message: 'phase7-private-message' });
    const output = chunks.join('');
    for (const sensitive of ['phase7-sensitive-token', 'phase7-sensitive-cookie', 'phase7-sensitive-password', 'phase7-private-message', '31.234567', '121.456789']) {
      expect(output).not.toContain(sensitive);
    }
  });
});
