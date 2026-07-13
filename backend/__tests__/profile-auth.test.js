process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const sessionService = require('../services/SessionService');
const { connectDB, disconnectDB, clearDB } = require('./setup');

let app;

beforeAll(async () => {
  await connectDB();
  app = require('../index').app;
});
afterAll(async () => { await disconnectDB(); });
afterEach(async () => { await clearDB(); });

async function createUser(name, extra = {}) {
  const user = await User.create({
    name,
    password: await bcrypt.hash('profile-password', 10),
    ...extra,
  });
  return { user, token: sessionService.issueToken(user) };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('PUT /api/users/profile identity policy', () => {
  test('rejects an ordinary user taking the trimmed founder display name', async () => {
    const { user, token } = await createUser('ordinary-profile');

    const res = await request(app)
      .put('/api/users/profile')
      .set(authHeader(token))
      .send({ name: '  阿森  ' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/reserved/i);
    expect((await User.findById(user._id)).name).toBe('ordinary-profile');
  });

  test('uses the shared profile schema to reject names over 30 characters', async () => {
    const { user, token } = await createUser('validated-profile');

    const res = await request(app)
      .put('/api/users/profile')
      .set(authHeader(token))
      .send({ name: 'x'.repeat(31) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect((await User.findById(user._id)).name).toBe('validated-profile');
  });

  test('allows the canonical founder identity to claim its reserved display name', async () => {
    const { user, token } = await createUser('founder-before-rename', {
      role: 'admin',
      systemIdentity: 'asen',
    });

    const res = await request(app)
      .put('/api/users/profile')
      .set(authHeader(token))
      .send({ name: '阿森' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('阿森');
    expect((await User.findById(user._id)).name).toBe('阿森');
  });
});

describe('SessionService canonical identity', () => {
  test('returns null for an ordinary user systemIdentity', async () => {
    const { token } = await createUser('ordinary-session');

    const session = await sessionService.hydrateToken(token);

    expect(session.systemIdentity).toBeNull();
  });
});
