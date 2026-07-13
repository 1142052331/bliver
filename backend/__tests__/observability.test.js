process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';

const request = require('supertest');

let app;
beforeAll(() => { app = require('../index').app; });

describe('request observability', () => {
  test('returns a request id and health aggregate without request data', async () => {
    const requestId = 'phase8-test-request';
    const response = await request(app)
      .get('/healthz')
      .set('X-Request-Id', requestId)
      .set('Authorization', 'Bearer should-not-appear');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.status).toBe('ok');
    expect(response.body.release).toEqual(expect.any(String));
    expect(response.body.node).toBe(process.version);
    expect(response.body.uptime).toEqual(expect.any(Number));
    expect(response.body.requests).toEqual(expect.any(Array));
    expect(JSON.stringify(response.body)).not.toContain('should-not-appear');
  });

  test('records completed API responses by method, path, and status', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    const health = await request(app).get('/healthz');
    expect(health.body.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: '/api/does-not-exist', count: 1 }),
    ]));
  });
});
