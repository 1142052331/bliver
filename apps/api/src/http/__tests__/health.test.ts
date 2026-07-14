import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../../bootstrap/config.js';
import { createApp } from '../app.js';

const config = createConfig({
  NODE_ENV: 'test',
  DEPLOY_ENV: 'test',
  RELEASE_SHA: 'release-test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234',
});

function createDb(shouldFail = false) {
  return {
    async query() {
      if (shouldFail) {
        throw new Error('database unavailable');
      }
      return { rows: [{ ok: 1 }] };
    },
  };
}

describe('V2 API foundation routes', () => {
  it('returns the typed health response', async () => {
    const response = await request(createApp({ config, db: createDb() })).get(
      '/healthz',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      version: 'release-test',
      environment: 'test',
    });
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('reports readiness only when the database port responds', async () => {
    const ready = await request(createApp({ config, db: createDb() })).get(
      '/readyz',
    );
    const unavailable = await request(
      createApp({ config, db: createDb(true) }),
    ).get('/readyz');

    expect(ready.status).toBe(200);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toMatchObject({
      type: 'about:blank',
      title: 'Service unavailable',
      status: 503,
      code: 'DB_UNAVAILABLE',
    });
  });

  it('returns release metadata from the version route', async () => {
    const response = await request(createApp({ config, db: createDb() })).get(
      '/versionz',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      version: 'release-test',
      environment: 'test',
    });
  });

  it('returns Problem Details with a request id for missing routes', async () => {
    const response = await request(createApp({ config, db: createDb() }))
      .get('/missing')
      .set('x-request-id', 'request-test-1');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.headers['x-request-id']).toBe('request-test-1');
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'request-test-1',
    });
  });
});
