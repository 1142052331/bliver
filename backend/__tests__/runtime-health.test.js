process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';
process.env.RENDER_GIT_COMMIT = 'render-health-sha';
process.env.RELEASE_SHA = 'fallback-health-sha';
process.env.DEPLOY_ENV = 'candidate';

const request = require('supertest');
const http = require('http');

describe('runtime health endpoints', () => {
  let app;

  beforeAll(() => {
    app = require('../index').app;
  });

  test('exposes release-aware liveness, readiness, and version responses', async () => {
    const health = await request(app).get('/healthz');
    const ready = await request(app).get('/readyz');
    const version = await request(app).get('/versionz');

    expect(health.status).toBe(200);
    expect(health.headers['cache-control']).toBe('no-store');
    expect(health.body).toEqual(expect.objectContaining({
      status: 'ok',
      release: 'render-health-sha',
      node: process.version,
    }));
    expect(ready.headers['cache-control']).toBe('no-store');
    expect([200, 503]).toContain(ready.status);
    expect(ready.body).toEqual(expect.objectContaining({
      ready: expect.any(Boolean),
      database: expect.any(Boolean),
      frontend: expect.any(Boolean),
    }));
    expect(version.status).toBe(200);
    expect(version.headers['cache-control']).toBe('no-store');
    expect(version.body).toEqual({
      release: 'render-health-sha',
      node: process.version,
      environment: 'candidate',
    });
    expect(JSON.stringify({ health: health.body, ready: ready.body, version: version.body }))
      .not.toMatch(/MONGODB_URI|JWT_SECRET|CLOUDINARY|frontend\\dist|mongodb\\+srv/i);
  });
});

describe('runtime status and graceful shutdown', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('reports database and frontend readiness using injected dependencies', () => {
    const { createRuntimeStatus } = require('../services/runtimeStatus');
    const connection = { readyState: 1 };
    const runtime = createRuntimeStatus({
      connection,
      frontendIndexPath: 'redacted-path',
      existsSync: () => true,
      env: { RENDER_GIT_COMMIT: '', RELEASE_SHA: 'release-fallback', DEPLOY_ENV: 'test' },
      nodeVersion: 'v24.test',
    });

    expect(runtime.readiness()).toEqual({ ready: true, database: true, frontend: true });
    expect(runtime.version()).toEqual({
      release: 'release-fallback',
      node: 'v24.test',
      environment: 'test',
    });

    connection.readyState = 0;
    expect(runtime.readiness()).toEqual({ ready: false, database: false, frontend: true });
    expect(runtime.release()).toBe('release-fallback');
  });

  test('runs shutdown steps once and exits even when a close step fails', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    const shutdown = createGracefulShutdown({
      server: { close: (done) => { events.push('server'); done(new Error('not listening')); } },
      io: { close: (done) => { events.push('io'); done(); } },
      disconnect: async () => { events.push('mongo'); },
      exit: (code) => { events.push(`exit:${code}`); },
      logger: { error: () => {} },
    });

    await Promise.all([shutdown(), shutdown()]);

    expect(events).toEqual(['server', 'io', 'mongo', 'exit:1']);
  });

  test('waits for a listening HTTP server before closing Socket.IO and MongoDB', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(0, resolve));
    const closeServer = server.close.bind(server);
    server.close = (...args) => closeServer(() => { events.push('server'); args[0](); });
    const shutdown = createGracefulShutdown({
      server,
      io: { close: (done) => { events.push('io'); done(); } },
      disconnect: async () => { events.push('mongo'); },
      exit: () => { events.push('exit'); },
      logger: { error: () => {} },
    });

    await shutdown();

    expect(events).toEqual(['server', 'io', 'mongo', 'exit']);
    expect(server.listening).toBe(false);
  });
});
