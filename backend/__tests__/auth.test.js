// Ensure JWT_SECRET is set before loading the app
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';

const request = require('supertest');
const User = require('../models/User');
const { connectDB, disconnectDB, clearDB } = require('./setup');

let app;
beforeAll(async () => { await connectDB(); app = require('../index').app; });
afterAll(async () => { await disconnectDB(); });
afterEach(async () => { await clearDB(); });

describe('POST /api/auth/register', () => {
  test('registers a new user and records IP', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'newuser', password: 'secret123' })
      .set('X-Forwarded-For', '1.2.3.4');

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('newuser');
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.lastFootprintVisibility).toBe('public');

    // Verify IP fields in DB
    const user = await User.findOne({ name: 'newuser' });
    expect(user).toBeTruthy();
    expect(user.registerIp).toBe('1.2.3.4');
    expect(user.lastLoginIp).toBe('1.2.3.4');
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  test('rejects duplicate name', async () => {
    await User.create({ name: 'dupe', password: 'hash' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'dupe', password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/taken/i);
  });

  test('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  test('falls back to remoteAddress when x-forwarded-for absent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'noheader', password: 'secret123' });

    expect(res.status).toBe(201);
    const user = await User.findOne({ name: 'noheader' });
    // remoteAddress is set by supertest (usually ::ffff:127.0.0.1)
    expect(user.registerIp).toBeTruthy();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Create a test user directly in DB
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('mypassword', 10);
    await User.create({
      name: 'loginuser',
      password: hash,
      registerIp: '10.0.0.1',
      lastLoginIp: '10.0.0.1',
    });
  });

  test('login succeeds with correct password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'loginuser', password: 'mypassword' })
      .set('X-Forwarded-For', '5.6.7.8');

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('loginuser');
    expect(res.body.user.lastFootprintVisibility).toBe('public');
  });

  test('login preserves an existing lastFootprintVisibility preference', async () => {
    await User.updateOne({ name: 'loginuser' }, { lastFootprintVisibility: 'private' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'loginuser', password: 'mypassword' });

    expect(res.status).toBe(200);
    expect(res.body.user.lastFootprintVisibility).toBe('private');
  });

  test('login updates lastLoginIp and lastLoginAt', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ name: 'loginuser', password: 'mypassword' })
      .set('X-Forwarded-For', '9.9.9.9');

    const user = await User.findOne({ name: 'loginuser' });
    expect(user.lastLoginIp).toBe('9.9.9.9');
    expect(user.registerIp).toBe('10.0.0.1'); // unchanged
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  test('login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'loginuser', password: 'WRONG' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(res.body.token).toBeUndefined();
  });

  test('login rejects non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'nobody', password: 'whatever' });

    expect(res.status).toBe(400);
  });

  test('阿森 is auto-promoted to admin on login', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('asenpass', 10);
    await User.create({
      name: '阿森',
      password: hash,
      role: 'user',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: '阿森', password: 'asenpass' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');

    const user = await User.findOne({ name: '阿森' });
    expect(user.role).toBe('admin');
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user with valid token', async () => {
    // Register to get a token
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'meuser', password: 'secret123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('meuser');
    expect(res.body.user.password).toBeUndefined();
  });

  test('rejects without token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  test('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(401);
  });
});
