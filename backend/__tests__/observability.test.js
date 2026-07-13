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

  test('records completed API responses by method and status without paths', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    const health = await request(app).get('/healthz');
    expect(health.body.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', status: 404, count: 1 }),
    ]));
    expect(health.body.requests.every((entry) => !Object.hasOwn(entry, 'path'))).toBe(true);
  });

  test('does not expose dynamic user, footprint, or comment IDs in health output', async () => {
    const ids = {
      user: 'user-9f7d3e1a-2d2b-4d0c-9a12-8f3b0d91e4aa',
      footprint: 'footprint-3a7f1d6b-7b89-4f0c-8c2d-1d77ab90ce12',
      comment: 'comment-6e1f2a44-0d2c-4ac3-a3b8-93c0d5f1b725',
    };
    await request(app)
      .get(`/api/users/${ids.user}/footprints/${ids.footprint}/comments/${ids.comment}`);

    const health = await request(app).get('/healthz');
    const serialized = JSON.stringify(health.body);
    Object.values(ids).forEach((id) => expect(serialized).not.toContain(id));
    expect(health.body.requests.every((entry) => !Object.hasOwn(entry, 'path'))).toBe(true);
  });
});
