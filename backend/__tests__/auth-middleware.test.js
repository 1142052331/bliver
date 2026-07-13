process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const { auth, admin, optionalAuth } = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');
const { setupSocket } = require('../socket');
const { connectDB, disconnectDB, clearDB } = require('./setup');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user, claims = {}) {
  return jwt.sign({
    id: user.id,
    sessionVersion: user.sessionVersion ?? 0,
    ...claims,
  }, JWT_SECRET);
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function createMiddlewareApp() {
  const app = express();
  app.get('/required', auth, (req, res) => res.json({ user: req.user }));
  app.get('/optional', optionalAuth, (req, res) => {
    res.json({ user: req.user || null, isAdmin: req.isAdmin || false });
  });
  app.get('/admin', auth, admin, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

function createSocketMiddleware() {
  let middleware;
  const io = {
    emit: jest.fn(),
    on: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    use: jest.fn((candidate) => { middleware = candidate; }),
  };
  setupSocket(io);
  return middleware;
}

function authenticateSocket(middleware, token) {
  const socket = {
    handshake: { auth: { token } },
    join: jest.fn().mockResolvedValue(undefined),
  };
  return {
    socket,
    result: new Promise((resolve, reject) => {
      try {
        const pending = middleware(socket, (error) => resolve(error));
        if (pending?.catch) pending.catch(reject);
      } catch (error) {
        reject(error);
      }
    }),
  };
}

let app;
let socketMiddleware;

beforeAll(async () => {
  await connectDB();
  app = createMiddlewareApp();
  socketMiddleware = createSocketMiddleware();
});

afterAll(disconnectDB);
afterEach(clearDB);

describe('database-authoritative HTTP authentication', () => {
  test('hydrates renamed users and current roles instead of trusting stale JWT claims', async () => {
    const user = await User.create({ name: 'before-rename', password: 'hash', role: 'user' });
    const token = signToken(user, { name: 'before-rename', role: 'admin' });
    await User.updateOne({ _id: user._id }, { name: 'after-rename' });

    const response = await request(app).get('/required').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: user.id,
      name: 'after-rename',
      role: 'user',
      sessionVersion: 0,
    });
    expect(response.body.user).not.toHaveProperty('password');
  });

  test('rejects a token after its account is deleted', async () => {
    const user = await User.create({ name: 'deleted-user', password: 'hash' });
    const token = signToken(user);
    await User.deleteOne({ _id: user._id });

    const response = await request(app).get('/required').set(bearer(token));

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid session');
  });

  test('rejects a token after sessionVersion is incremented', async () => {
    const user = await User.create({ name: 'revoked-user', password: 'hash' });
    const token = signToken(user);
    await User.collection.updateOne({ _id: user._id }, { $set: { sessionVersion: 1 } });

    const response = await request(app).get('/required').set(bearer(token));

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid session');
  });

  test('accepts legacy tokens without sessionVersion while the database version is zero', async () => {
    const user = await User.create({ name: 'legacy-user', password: 'hash' });
    const token = jwt.sign({ id: user.id, name: 'legacy-user', role: 'user' }, JWT_SECRET);

    const response = await request(app).get('/required').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('legacy-user');
  });

  test('denies stale admin claims after the database role is downgraded', async () => {
    const user = await User.create({ name: 'former-admin', password: 'hash', role: 'user' });
    const token = signToken(user, { role: 'admin' });

    const response = await request(app).get('/admin').set(bearer(token));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Admin only');
  });

  test('accepts stale user claims after the database role is upgraded', async () => {
    const user = await User.create({ name: 'new-admin', password: 'hash', role: 'admin' });
    const token = signToken(user, { role: 'user' });

    const response = await request(app).get('/admin').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('treats an invalid optional bearer token as unauthorized, not as a guest', async () => {
    const response = await request(app)
      .get('/optional')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid session');
  });

  test('keeps optional authentication guest access when no header is present', async () => {
    const response = await request(app).get('/optional');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: null, isAdmin: false });
  });
});

describe('database-authoritative Socket authentication', () => {
  test('hydrates the canonical principal before joining its user room', async () => {
    const user = await User.create({ name: 'socket-current', password: 'hash', role: 'user' });
    const token = signToken(user, { name: 'socket-stale', role: 'admin' });
    const { socket, result } = authenticateSocket(socketMiddleware, token);

    await expect(result).resolves.toBeUndefined();
    expect(socket.userId).toBe(user.id);
    expect(socket.user).toMatchObject({ name: 'socket-current', role: 'user' });
    expect(socket.join).toHaveBeenCalledWith(user.id);
  });

  test('rejects a deleted Socket principal during the handshake', async () => {
    const user = await User.create({ name: 'socket-deleted', password: 'hash' });
    const token = signToken(user);
    await User.deleteOne({ _id: user._id });
    const { socket, result } = authenticateSocket(socketMiddleware, token);

    await expect(result).resolves.toMatchObject({ message: 'Invalid session' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  test('rejects a revoked Socket principal during the handshake', async () => {
    const user = await User.create({ name: 'socket-revoked', password: 'hash' });
    const token = signToken(user);
    await User.collection.updateOne({ _id: user._id }, { $set: { sessionVersion: 1 } });
    const { socket, result } = authenticateSocket(socketMiddleware, token);

    await expect(result).resolves.toMatchObject({ message: 'Invalid session' });
    expect(socket.join).not.toHaveBeenCalled();
  });
});
