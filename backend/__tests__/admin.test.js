process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sessionService = require('../services/SessionService');
const { connectDB, disconnectDB, clearDB } = require('./setup');

let app;
beforeAll(async () => { await connectDB(); app = require('../index').app; });
afterAll(async () => { await disconnectDB(); });
afterEach(async () => { await clearDB(); });

const JWT_SECRET = process.env.JWT_SECRET;

// Helper: create an admin user, return token
async function createAdmin(name = 'admin') {
  const hash = await bcrypt.hash('adminpass', 10);
  const user = await User.create({ name, password: hash, role: 'admin' });
  return jwt.sign({ id: user._id, name: user.name, role: 'admin' }, JWT_SECRET);
}

// Helper: create a regular user, return user doc
async function createUser(name, opts = {}) {
  const hash = await bcrypt.hash('userpass', 10);
  return User.create({
    name,
    password: hash,
    role: 'user',
    registerIp: opts.registerIp || '',
    lastLoginIp: opts.lastLoginIp || '',
    lastLoginAt: opts.lastLoginAt || null,
    ...opts.extra,
  });
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/admin/online', () => {
  test('admin can see online users list', async () => {
    const token = await createAdmin();
    const res = await request(app)
      .get('/api/admin/online')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.online)).toBe(true);
  });

  test('non-admin is rejected', async () => {
    const user = await createUser('regular');
    const userToken = jwt.sign({ id: user._id, name: user.name, role: 'user' }, JWT_SECRET);

    const res = await request(app)
      .get('/api/admin/online')
      .set(authHeader(userToken));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  test('unauthenticated is rejected', async () => {
    const res = await request(app)
      .get('/api/admin/online');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/users', () => {
  beforeEach(async () => {
    await createUser('alice', { registerIp: '1.1.1.1', lastLoginIp: '2.2.2.2', lastLoginAt: new Date() });
    await createUser('bob', { registerIp: '3.3.3.3', lastLoginIp: '3.3.3.3' });
  });

  test('admin can list all users', async () => {
    const token = await createAdmin();
    const res = await request(app)
      .get('/api/admin/users')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    // Users should include IP fields
    const alice = res.body.users.find(u => u.name === 'alice');
    expect(alice).toBeTruthy();
    expect(alice.lastLoginIp).toBe('2.2.2.2');
    expect(alice.registerIp).toBe('1.1.1.1');
    // Password should be excluded
    expect(alice.password).toBeUndefined();
  });
});

describe('GET /api/admin/clones', () => {
  test('detects users sharing the same register IP', async () => {
    await createUser('clone_a', { registerIp: '192.168.1.1', lastLoginAt: new Date() });
    await createUser('clone_b', { registerIp: '192.168.1.1', lastLoginAt: new Date() });
    await createUser('lone_wolf', { registerIp: '10.0.0.1' });

    const token = await createAdmin();
    const res = await request(app)
      .get('/api/admin/clones')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.groups.length).toBeGreaterThanOrEqual(1);

    const registerGroup = res.body.groups.find(g => g.type === 'registerIp');
    expect(registerGroup).toBeTruthy();
    expect(registerGroup.users.length).toBe(2);
    expect(registerGroup.ip).toBe('192.168.1.1');
  });

  test('detects users sharing the same lastLoginIp', async () => {
    await createUser('user_x', { lastLoginIp: '55.55.55.55', lastLoginAt: new Date() });
    await createUser('user_y', { lastLoginIp: '55.55.55.55', lastLoginAt: new Date() });

    const token = await createAdmin();
    const res = await request(app)
      .get('/api/admin/clones')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const loginGroup = res.body.groups.find(g => g.type === 'lastLoginIp');
    expect(loginGroup).toBeTruthy();
    expect(loginGroup.users.length).toBe(2);
  });

  test('does not flag users without IP data', async () => {
    await createUser('no_ip_1');
    await createUser('no_ip_2');

    const token = await createAdmin();
    const res = await request(app)
      .get('/api/admin/clones')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    // Users with empty IPs should be skipped, not grouped as 'unknown'
    const unknownGroup = res.body.groups.find(g => g.ip === '' || g.ip === 'unknown');
    expect(unknownGroup).toBeUndefined();
  });
});

describe('PUT /api/admin/users/:id', () => {
  test('admin can rename a user', async () => {
    const token = await createAdmin();
    const user = await createUser('oldname');

    const res = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({ name: 'newname' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('newname');

    const updated = await User.findById(user._id);
    expect(updated.name).toBe('newname');
  });

  test('admin can change a user password', async () => {
    const token = await createAdmin();
    const user = await createUser('pwuser');

    const res = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({ password: 'newsecurepass' });

    expect(res.status).toBe(200);

    // Verify new password works
    const updated = await User.findById(user._id);
    const match = await bcrypt.compare('newsecurepass', updated.password);
    expect(match).toBe(true);
  });

  test('rejects admin password changes shorter than eight characters', async () => {
    const token = await createAdmin();
    const user = await createUser('short-admin-password');

    const res = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({ password: 'short7' });

    expect(res.status).toBe(400);
  });

  test('revokes existing sessions when an admin changes a password', async () => {
    const token = await createAdmin();
    const user = await createUser('revoke-on-password');
    const oldToken = sessionService.issueToken(user);

    const update = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({ password: 'replacement-password' });

    expect(update.status).toBe(200);
    const updated = await User.findById(user._id);
    expect(updated.sessionVersion).toBe(1);

    const me = await request(app)
      .get('/api/auth/me')
      .set(authHeader(oldToken));
    expect(me.status).toBe(401);
  });

  test('does not let an admin assign the founder display name to an ordinary user', async () => {
    const token = await createAdmin();
    const user = await createUser('rename-takeover');

    const res = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({ name: '  阿森  ' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/reserved/i);
    expect((await User.findById(user._id)).name).toBe('rename-takeover');
  });

  test('rejects empty update body', async () => {
    const token = await createAdmin();
    const user = await createUser('emptyupdate');

    const res = await request(app)
      .put(`/api/admin/users/${user._id}`)
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  test('admin can delete a regular user', async () => {
    const token = await createAdmin();
    const user = await createUser('victim');

    const res = await request(app)
      .delete(`/api/admin/users/${user._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const gone = await User.findById(user._id);
    expect(gone).toBeNull();
  });

  test('cannot delete another admin', async () => {
    const token = await createAdmin('asen');
    const otherAdmin = await User.create({
      name: 'other_admin',
      password: await bcrypt.hash('pass', 10),
      role: 'admin',
    });

    const res = await request(app)
      .delete(`/api/admin/users/${otherAdmin._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot delete/i);
  });
});

describe('POST /api/admin/kick/:userId', () => {
  test('admin can kick a user (offline case)', async () => {
    const token = await createAdmin();
    const user = await createUser('kickme');

    const res = await request(app)
      .post(`/api/admin/kick/${user._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await User.findById(user._id);
    expect(updated.isOnline).toBe(false);
  });

  test('cannot kick an admin', async () => {
    const token = await createAdmin('asen');
    const otherAdmin = await User.create({
      name: 'untouchable',
      password: await bcrypt.hash('pass', 10),
      role: 'admin',
    });

    const res = await request(app)
      .post(`/api/admin/kick/${otherAdmin._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });

  test('revokes HTTP sessions and disconnects the active socket', async () => {
    const token = await createAdmin();
    const user = await createUser('kick-session');
    const oldToken = sessionService.issueToken(user);
    const originalSocketIO = global.__socketIO;
    const sockets = [1, 2].map(() => ({
      userId: user.id,
      emit: jest.fn(),
      disconnect: jest.fn(),
    }));
    global.__socketIO = { fetchSockets: jest.fn().mockResolvedValue(sockets) };

    try {
      const res = await request(app)
        .post(`/api/admin/kick/${user._id}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(global.__socketIO.fetchSockets).toHaveBeenCalled();
      for (const socket of sockets) {
        expect(socket.emit).toHaveBeenCalledWith('force_logout', expect.objectContaining({ reason: expect.any(String) }));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      for (const socket of sockets) {
        expect(socket.disconnect).toHaveBeenCalledWith(true);
      }

      const updated = await User.findById(user._id);
      expect(updated.sessionVersion).toBe(1);
      const me = await request(app)
        .get('/api/auth/me')
        .set(authHeader(oldToken));
      expect(me.status).toBe(401);
    } finally {
      global.__socketIO = originalSocketIO;
    }
  });
});
