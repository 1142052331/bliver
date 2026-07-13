process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Report = require('../models/Report');
const { connectDB, disconnectDB, clearDB } = require('./setup');

describe('report HTTP contract', () => {
  let app;
  let owner;
  let viewer;
  let admin;
  let footprint;

  beforeAll(async () => {
    await connectDB();
    app = express();
    app.use(express.json());
    app.use('/api', require('../routes/api'));
    app.use('/api', require('../routes/admin'));
    app.use(require('../middleware/errorHandler'));
  });
  afterAll(disconnectDB);
  afterEach(clearDB);

  beforeEach(async () => {
    [owner, viewer, admin] = await Promise.all([
      User.create({ name: 'owner', password: 'hash' }),
      User.create({ name: 'viewer', password: 'hash' }),
      User.create({ name: 'admin', password: 'hash', role: 'admin' }),
    ]);
    footprint = await Footprint.create({
      userId: owner._id,
      location: { lat: 31.23, lng: 121.47 },
      visibility: 'public',
      discoveryExpiresAt: new Date(Date.now() + 86400000),
      message: 'reportable',
    });
  });

  const auth = (user) => ({
    Authorization: `Bearer ${jwt.sign({ id: user.id, name: user.name, role: user.role }, process.env.JWT_SECRET)}`,
  });
  const validReport = () => ({
    targetType: 'footprint', targetId: footprint.id, reason: 'spam', details: 'duplicate post',
  });

  test('requires auth, is idempotent, and exposes admin moderation only', async () => {
    await request(app).post('/api/reports').send(validReport()).expect(401);

    const first = await request(app).post('/api/reports').set(auth(viewer)).send(validReport()).expect(201);
    const second = await request(app).post('/api/reports').set(auth(viewer)).send(validReport()).expect(200);
    expect(second.body.report._id).toBe(first.body.report._id);

    await request(app).get('/api/admin/reports').set(auth(viewer)).expect(403);
    const queue = await request(app).get('/api/admin/reports').set(auth(admin)).expect(200);
    expect(queue.body.reports).toHaveLength(1);
  });

  test('allows an administrator to dismiss a pending report', async () => {
    const created = await request(app).post('/api/reports').set(auth(viewer)).send(validReport()).expect(201);
    const response = await request(app)
      .put(`/api/admin/reports/${created.body.report._id}`)
      .set(auth(admin))
      .send({ resolution: 'dismiss' })
      .expect(200);

    expect(response.body.report.status).toBe('dismissed');
    expect(await Report.findById(created.body.report._id)).toMatchObject({ status: 'dismissed' });
  });
});
