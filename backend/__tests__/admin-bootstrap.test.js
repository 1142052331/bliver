process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.PORT = '0';
process.env.ADMIN_SETUP_SECRET = 'bootstrap-secret-value';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const AdminBootstrap = require('../models/AdminBootstrap');
const sessionService = require('../services/SessionService');
const auditService = require('../services/AuditService');
const { connectDB, disconnectDB, clearDB } = require('./setup');

let app;
let adminService;
let bootstrapCollection;
let ipCounter = 1;

beforeAll(async () => {
  await connectDB();
  app = require('../index').app;
  adminService = require('../services/AdminService');
  bootstrapCollection = mongoose.connection.collection('adminbootstraps');
});
afterAll(async () => { await disconnectDB(); });
afterEach(async () => {
  await clearDB();
  process.env.ADMIN_SETUP_SECRET = 'bootstrap-secret-value';
});

async function createUser(name, extra = {}) {
  const user = await User.create({
    name,
    password: await bcrypt.hash('bootstrap-password', 10),
    ...extra,
  });
  return { user, token: sessionService.issueToken(user) };
}

function setupRequest(token, body = { secret: 'bootstrap-secret-value' }) {
  ipCounter += 1;
  return request(app)
    .post('/api/admin/setup')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Forwarded-For', `198.51.100.${ipCounter}`)
    .send(body);
}

function unauthenticatedSetupRequest(ip) {
  return request(app)
    .post('/api/admin/setup')
    .set('X-Forwarded-For', `203.0.113.44, ${ip}`)
    .send({ secret: 'bootstrap-secret-value' });
}

describe('POST /api/admin/setup', () => {
  test('uses a strict schema for missing, empty, and extra setup fields', async () => {
    const { token } = await createUser('strict-setup');

    const missing = await setupRequest(token, {});
    const empty = await setupRequest(token, { secret: '' });
    const extra = await setupRequest(token, { secret: 'bootstrap-secret-value', role: 'admin' });

    expect(missing.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(extra.status).toBe(400);
  });

  test('rejects a wrong secret without changing role or session version', async () => {
    const { user, token } = await createUser('wrong-setup-secret');

    const res = await setupRequest(token, { secret: 'not-the-secret' });

    expect(res.status).toBe(403);
    const unchanged = await User.findById(user._id);
    expect(unchanged.role).toBe('user');
    expect(unchanged.sessionVersion).toBe(0);
    expect(await bootstrapCollection.countDocuments()).toBe(0);
  });

  test('rejects setup when the database already has an admin', async () => {
    await createUser('existing-admin', { role: 'admin' });
    const { user, token } = await createUser('admin-candidate');

    const res = await setupRequest(token);

    expect(res.status).toBe(409);
    expect((await User.findById(user._id)).role).toBe('user');
    expect(await bootstrapCollection.countDocuments()).toBe(0);
  });

  test('checks an existing admin before validating the setup secret', async () => {
    await createUser('existing-admin-secret-order', { role: 'admin' });
    const { user } = await createUser('candidate-secret-order');

    await expect(adminService.setupAdmin(user._id, 'wrong-secret'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('checks an existing bootstrap lock before validating the setup secret', async () => {
    const { user } = await createUser('candidate-locked-secret-order');
    await bootstrapCollection.insertOne({
      _id: 'admin-setup',
      key: 'admin-setup',
      state: 'pending',
      userId: new mongoose.Types.ObjectId(),
      ownerToken: 'existing-owner',
      leaseExpiresAt: new Date(0),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    await expect(adminService.setupAdmin(user._id, 'wrong-secret'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('promotes once, revokes the old token, and returns a fresh admin token', async () => {
    const { user, token: oldToken } = await createUser('first-admin');

    const res = await setupRequest(oldToken);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    const promoted = await User.findById(user._id);
    expect(promoted.role).toBe('admin');
    expect(promoted.sessionVersion).toBe(1);

    const stale = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(stale.status).toBe(401);

    const fresh = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(fresh.status).toBe(200);

    const lock = await bootstrapCollection.findOne();
    expect(lock).toMatchObject({ key: 'admin-setup', state: 'completed' });

    const audit = await AuditLog.findOne({ type: 'admin_setup' }).lean();
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(process.env.ADMIN_SETUP_SECRET);
  });

  test('returns 409 on every call after setup completed', async () => {
    const { token } = await createUser('repeat-setup');
    const first = await setupRequest(token);
    const second = await setupRequest(first.body.token);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
  });

  test('returns 409 after completion even when the setup secret is removed', async () => {
    const { token } = await createUser('removed-secret-setup');
    const first = await setupRequest(token);
    expect(first.status).toBe(200);

    delete process.env.ADMIN_SETUP_SECRET;
    const second = await setupRequest(first.body.token);

    expect(second.status).toBe(409);
  });

  test('does not consume the authenticated setup quota for unauthenticated requests', async () => {
    const ip = '198.51.100.44';
    const unauthenticated = await Promise.all(
      Array.from({ length: 6 }, () => unauthenticatedSetupRequest(ip)),
    );
    expect(unauthenticated.every((response) => response.status === 401)).toBe(true);

    const { token } = await createUser('setup-after-unauthenticated');
    const authenticated = await request(app)
      .post('/api/admin/setup')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', `203.0.113.45, ${ip}`)
      .send({ secret: 'bootstrap-secret-value' });

    expect(authenticated.status).toBe(200);
  });

  test('allows at most one concurrent setup request to succeed', async () => {
    const first = await createUser('concurrent-first');
    const second = await createUser('concurrent-second');

    const responses = await Promise.all([
      setupRequest(first.token),
      setupRequest(second.token),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
    expect(await bootstrapCollection.countDocuments({ key: 'admin-setup', state: 'completed' })).toBe(1);
  });

  test('cleans a pending lock when promotion fails', async () => {
    const missingUserId = new mongoose.Types.ObjectId();

    await expect(adminService.setupAdmin(missingUserId, process.env.ADMIN_SETUP_SECRET))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(await bootstrapCollection.countDocuments()).toBe(0);

    const { token } = await createUser('after-failed-lock');
    const res = await setupRequest(token);
    expect(res.status).toBe(200);
  });

  test('compensates a promotion when completion of its owned lock fails', async () => {
    const { user, token: oldToken } = await createUser('lock-write-failure');
    const completionSpy = jest.spyOn(AdminBootstrap, 'updateOne')
      .mockRejectedValueOnce(new Error('lock write failed'));

    try {
      await expect(adminService.setupAdmin(user._id, process.env.ADMIN_SETUP_SECRET))
        .rejects.toThrow('lock write failed');
    } finally {
      completionSpy.mockRestore();
    }

    const rolledBack = await User.findById(user._id);
    expect(rolledBack.role).toBe('user');
    expect(rolledBack.sessionVersion).toBe(2);
    expect(await bootstrapCollection.countDocuments()).toBe(0);

    const stale = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(stale.status).toBe(401);
  });

  test('keeps a completed promotion successful when audit persistence fails', async () => {
    const { user } = await createUser('audit-write-failure');
    const auditSpy = jest.spyOn(auditService, 'log')
      .mockRejectedValueOnce(new Error('audit write failed'));

    try {
      const result = await adminService.setupAdmin(user._id, process.env.ADMIN_SETUP_SECRET);

      expect(result.token).toEqual(expect.any(String));
    } finally {
      auditSpy.mockRestore();
    }

    expect((await User.findById(user._id)).role).toBe('admin');
    expect(await bootstrapCollection.countDocuments({ key: 'admin-setup', state: 'completed' })).toBe(1);
  });

  test('preserves a successful promotion when compensation loses its race', async () => {
    const { user } = await createUser('compensation-race');
    const completionSpy = jest.spyOn(AdminBootstrap, 'updateOne')
      .mockRejectedValueOnce(new Error('initial lock completion failed'));
    const rollbackSpy = jest.spyOn(User, 'updateOne')
      .mockRejectedValueOnce(new Error('rollback write failed'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = await adminService.setupAdmin(user._id, process.env.ADMIN_SETUP_SECRET);

      expect(result.token).toEqual(expect.any(String));
      expect(errorSpy).toHaveBeenCalledWith(
        '[AdminService] bootstrap promotion rollback failed:',
        'rollback write failed',
      );
    } finally {
      completionSpy.mockRestore();
      rollbackSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect((await User.findById(user._id)).role).toBe('admin');
    expect(await bootstrapCollection.countDocuments({ key: 'admin-setup', state: 'completed' })).toBe(1);
  });

  test('does not reclaim a pending bootstrap lock left by a crashed attempt', async () => {
    const abandoned = await createUser('abandoned-bootstrap');
    await bootstrapCollection.insertOne({
      _id: 'admin-setup',
      key: 'admin-setup',
      state: 'pending',
      userId: new mongoose.Types.ObjectId(),
      ownerToken: 'abandoned-owner',
      leaseExpiresAt: new Date(0),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    await expect(adminService.setupAdmin(abandoned.user._id, process.env.ADMIN_SETUP_SECRET))
      .rejects.toMatchObject({ statusCode: 409 });

    expect((await User.findById(abandoned.user._id)).role).toBe('user');
    expect(await bootstrapCollection.findOne({ _id: 'admin-setup' }))
      .toMatchObject({ ownerToken: 'abandoned-owner', state: 'pending' });
  });
});
