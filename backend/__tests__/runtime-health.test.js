process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';
process.env.RENDER_GIT_COMMIT = 'render-health-sha';
process.env.RELEASE_SHA = 'fallback-health-sha';
process.env.DEPLOY_ENV = 'candidate';

const request = require('supertest');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');

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

  test('stops HTTP acceptance, closes Socket.IO, then waits before MongoDB and exit', async () => {
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

    expect(events).toEqual(['io', 'server', 'mongo', 'exit']);
    expect(server.listening).toBe(false);
  });

  test('waits for an in-flight HTTP response before closing Socket.IO and MongoDB', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    let releaseResponse;
    let requestSeen;
    const requestStarted = new Promise((resolve) => { requestSeen = resolve; });
    const server = http.createServer((_req, res) => {
      events.push('request');
      requestSeen();
      releaseResponse = () => {
        events.push('response');
        res.end('ok');
      };
    });
    await new Promise((resolve) => server.listen(0, resolve));

    const response = new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}`, (res) => {
        res.resume();
        res.on('end', resolve);
      }).on('error', reject);
    });
    await requestStarted;

    const shutdown = createGracefulShutdown({
      server,
      io: { close: (done) => { events.push('io'); done(); } },
      disconnect: async () => { events.push('mongo'); },
      exit: () => { events.push('exit'); },
      logger: { error: () => {} },
    });
    const shutdownPromise = shutdown();

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['request', 'io']);

    releaseResponse();
    await response;
    await shutdownPromise;

    expect(events).toEqual(['request', 'io', 'response', 'mongo', 'exit']);
    expect(server.listening).toBe(false);
  });

  test('closes a Socket.IO-owned HTTP server once after an in-flight response', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    let releaseResponse;
    let requestSeen;
    const requestStarted = new Promise((resolve) => { requestSeen = resolve; });
    const server = http.createServer((_req, res) => {
      events.push('request');
      requestSeen();
      releaseResponse = () => {
        events.push('response');
        res.end('ok');
      };
    });
    const io = new SocketIOServer(server);
    await new Promise((resolve) => server.listen(0, resolve));

    const response = new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: server.address().port,
        headers: { Connection: 'close' },
      }, (res) => {
        res.resume();
        res.on('end', resolve);
      }).on('error', reject);
    });
    await requestStarted;

    const shutdown = createGracefulShutdown({
      server,
      io,
      disconnect: async () => { events.push('mongo'); },
      exit: (code) => { events.push(`exit:${code}`); },
      timeoutMs: 500,
      logger: { error: () => {} },
    });
    const shutdownPromise = shutdown();

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['request']);

    releaseResponse();
    await response;
    await shutdownPromise;

    expect(events).toEqual(['request', 'response', 'mongo', 'exit:0']);
    expect(server.listening).toBe(false);
  });

  test('bounds a hung MongoDB disconnect and swallows a late rejection', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    const failures = [];
    let rejectDisconnect;
    const disconnectPromise = new Promise((_resolve, reject) => {
      rejectDisconnect = reject;
    });
    const unhandled = [];
    const onUnhandled = (error) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);

    try {
      const shutdown = createGracefulShutdown({
        server: { close: (done) => { events.push('server'); done(); } },
        io: { close: (done) => { events.push('io'); done(); } },
        disconnect: () => disconnectPromise,
        exit: (code) => { events.push(`exit:${code}`); },
        timeoutMs: 10,
        logger: { error: (message) => failures.push(message) },
      });
      const shutdownPromise = shutdown();

      await new Promise((resolve) => setTimeout(resolve, 30));
      const exitedBeforeDisconnect = events.includes('exit:1');
      if (!exitedBeforeDisconnect) rejectDisconnect(new Error('late disconnect failure'));
      await shutdownPromise;
      if (exitedBeforeDisconnect) rejectDisconnect(new Error('late disconnect failure'));
      await new Promise((resolve) => setImmediate(resolve));

      expect(exitedBeforeDisconnect).toBe(true);
      expect(events).toEqual(['server', 'io', 'exit:1']);
      expect(failures).toEqual(['[shutdown] mongo failed']);
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  test('times out a resource close, records failure, and remains one-shot', async () => {
    const { createGracefulShutdown } = require('../services/runtimeStatus');
    const events = [];
    const failures = [];
    const shutdown = createGracefulShutdown({
      server: { close: (_done) => { events.push('server'); } },
      io: { close: (done) => { events.push('io'); done(); } },
      disconnect: async () => { events.push('mongo'); },
      exit: (code) => { events.push(`exit:${code}`); },
      timeoutMs: 10,
      logger: { error: (message) => failures.push(message) },
    });

    await Promise.all([shutdown(), shutdown()]);
    await shutdown();

    expect(events).toEqual(['server', 'io', 'mongo', 'exit:1']);
    expect(failures).toEqual(['[shutdown] server failed']);
  });
});
