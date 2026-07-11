process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.SENTRY_DSN = '';
process.env.DOTENV_CONFIG_QUIET = 'true';

jest.mock('../services/push', () => ({ sendPushToUser: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const {
  ensureReadBaseline,
  getUnreadByFootprintId,
  importLegacy,
  isFootprintUnread,
  markRead,
} = require('../services/FootprintReadService');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const FootprintRead = require('../models/FootprintRead');
const { connectDB, disconnectDB, clearDB } = require('./setup');

const NOW = new Date('2026-07-11T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('isFootprintUnread', () => {
  test.each([
    [
      'baseline makes existing content read',
      { userId: 'author', createdAt: new Date(+NOW - DAY), comments: [] },
      NOW,
      null,
      false,
    ],
    [
      'new stranger footprint is unread',
      { userId: 'author', createdAt: new Date(+NOW - DAY), comments: [] },
      new Date(+NOW - 2 * DAY),
      null,
      true,
    ],
    [
      'old footprint ages out of new state',
      { userId: 'author', createdAt: new Date(+NOW - 8 * DAY), comments: [] },
      new Date(+NOW - 10 * DAY),
      null,
      false,
    ],
    [
      'comment after read is unread',
      {
        userId: 'author',
        createdAt: new Date(+NOW - 8 * DAY),
        comments: [{ createdAt: NOW }],
      },
      new Date(+NOW - 10 * DAY),
      new Date(+NOW - DAY),
      true,
    ],
  ])('%s', (_name, footprint, baselineAt, readAt, expected) => {
    expect(isFootprintUnread({
      footprint,
      viewerId: 'viewer',
      baselineAt,
      readAt,
      now: NOW,
    })).toBe(expected);
  });

  test('does not call an owner\'s newly published footprint unread', () => {
    expect(isFootprintUnread({
      footprint: { userId: 'viewer', createdAt: NOW, comments: [] },
      viewerId: 'viewer',
      baselineAt: new Date(+NOW - DAY),
      readAt: null,
      now: NOW,
    })).toBe(false);
  });
});

describe('FootprintReadService', () => {
  let app;

  beforeAll(async () => {
    await connectDB();
    const express = require('express');
    app = express();
    app.use(express.json());
    app.use('/api', require('../routes/api'));
    app.use(require('../middleware/errorHandler'));
  });
  afterAll(disconnectDB);
  afterEach(clearDB);

  async function createUser(name) {
    return User.create({ name, password: 'hash' });
  }

  async function createFootprint(userId, fields = {}) {
    return Footprint.create({
      userId,
      location: { lat: 31.23, lng: 121.47 },
      visibility: 'public',
      discoveryExpiresAt: new Date(+NOW + DAY),
      ...fields,
    });
  }

  function tokenFor(user) {
    return jwt.sign({ id: user.id, name: user.name, role: user.role }, process.env.JWT_SECRET);
  }

  test('persists the first read baseline exactly once', async () => {
    const viewer = await createUser('viewer');

    const first = await ensureReadBaseline(viewer._id, NOW);
    const second = await ensureReadBaseline(viewer._id, new Date(+NOW + DAY));

    expect(first).toEqual(NOW);
    expect(second).toEqual(NOW);
  });

  test('marks a readable footprint with a monotonic read timestamp', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const footprint = await createFootprint(author._id);

    await markRead({ viewer: { id: viewer.id, role: 'user' }, footprintId: footprint.id, now: NOW });
    await markRead({
      viewer: { id: viewer.id, role: 'user' },
      footprintId: footprint.id,
      now: new Date(+NOW - DAY),
    });

    const state = await FootprintRead.findOne({ userId: viewer._id, footprintId: footprint._id });
    expect(state.readAt).toEqual(NOW);
  });

  test('does not reveal an unreadable footprint through mark-read', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const footprint = await createFootprint(author._id, { visibility: 'private' });

    await expect(markRead({
      viewer: { id: viewer.id, role: 'user' },
      footprintId: footprint.id,
      now: NOW,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('decorates footprints from one baseline and one read-state query', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const baselineAt = new Date(+NOW - 2 * DAY);
    await User.findByIdAndUpdate(viewer._id, { footprintReadBaselineAt: baselineAt });
    const footprint = await createFootprint(author._id, { createdAt: new Date(+NOW - DAY) });

    const before = await getUnreadByFootprintId({
      viewerId: viewer.id,
      footprints: [footprint],
      now: NOW,
    });
    expect(before.get(footprint.id)).toBe(true);

    await FootprintRead.create({ userId: viewer._id, footprintId: footprint._id, readAt: NOW });
    const after = await getUnreadByFootprintId({ viewerId: viewer.id, footprints: [footprint], now: NOW });
    expect(after.get(footprint.id)).toBe(false);
  });

  test('imports only readable legacy entries and clamps future timestamps', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const readable = await createFootprint(author._id);
    const hidden = await createFootprint(author._id, { visibility: 'private' });

    const result = await importLegacy({
      viewer: { id: viewer.id, role: 'user' },
      now: NOW,
      entries: [
        { footprintId: readable.id, readAt: +NOW + DAY },
        { footprintId: hidden.id, readAt: +NOW - DAY },
        { footprintId: 'invalid', readAt: +NOW },
      ],
    });

    expect(result).toEqual({ imported: 1, skipped: 2 });
    const state = await FootprintRead.findOne({ userId: viewer._id, footprintId: readable._id });
    expect(state.readAt).toEqual(NOW);
    expect(await FootprintRead.countDocuments()).toBe(1);
    expect((await User.findById(viewer._id)).footprintReadBaselineAt).toEqual(NOW);
  });

  test('hidden-only and invalid-only imports do not initialize read state', async () => {
    const author = await createUser('author');
    const hidden = await createFootprint(author._id, { visibility: 'private' });
    const hiddenViewer = await createUser('hidden-viewer');
    const invalidViewer = await createUser('invalid-viewer');

    await expect(importLegacy({
      viewer: { id: hiddenViewer.id, role: 'user' },
      entries: [{ footprintId: hidden.id, readAt: +NOW }],
      now: NOW,
    })).resolves.toEqual({ imported: 0, skipped: 1 });
    await expect(importLegacy({
      viewer: { id: invalidViewer.id, role: 'user' },
      entries: [{ footprintId: 'invalid', readAt: +NOW }],
      now: NOW,
    })).resolves.toEqual({ imported: 0, skipped: 1 });

    expect((await User.findById(hiddenViewer._id)).footprintReadBaselineAt).toBeNull();
    expect((await User.findById(invalidViewer._id)).footprintReadBaselineAt).toBeNull();
    expect(await FootprintRead.countDocuments()).toBe(0);
  });

  test('canonicalizes mixed-case duplicate footprint ids before importing', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const footprint = await createFootprint(author._id);

    const result = await importLegacy({
      viewer: { id: viewer.id, role: 'user' },
      entries: [
        { footprintId: footprint.id.toUpperCase(), readAt: +NOW + DAY },
        { footprintId: footprint.id, readAt: +NOW - DAY },
      ],
      now: NOW,
    });

    expect(result).toEqual({ imported: 1, skipped: 1 });
    const states = await FootprintRead.find({ userId: viewer._id });
    expect(states).toHaveLength(1);
    expect(states[0].footprintId.toString()).toBe(footprint.id);
    expect(states[0].readAt).toEqual(NOW);
    expect((await User.findById(viewer._id)).footprintReadBaselineAt).toEqual(NOW);
  });

  test('invalid readAt does not create read state or initialize the baseline', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const footprint = await createFootprint(author._id);

    await expect(importLegacy({
      viewer: { id: viewer.id, role: 'user' },
      entries: [
        { footprintId: footprint.id, readAt: null },
        { footprintId: footprint.id, readAt: Number.MAX_VALUE },
      ],
      now: NOW,
    })).resolves.toEqual({ imported: 0, skipped: 2 });

    expect(await FootprintRead.countDocuments()).toBe(0);
    expect((await User.findById(viewer._id)).footprintReadBaselineAt).toBeNull();
  });

  test('rejects legacy imports larger than 500 entries', async () => {
    const viewer = await createUser('viewer');
    const entries = Array.from({ length: 501 }, (_, index) => ({
      footprintId: String(index).padStart(24, '0'),
      readAt: +NOW,
    }));

    await expect(importLegacy({
      viewer: { id: viewer.id, role: 'user' },
      entries,
      now: NOW,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('PUT /api/footprints/:id/read persists authoritative read state', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const footprint = await createFootprint(author._id);

    const response = await request(app)
      .put(`/api/footprints/${footprint.id}/read`)
      .set('Authorization', `Bearer ${tokenFor(viewer)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(await FootprintRead.countDocuments({
      userId: viewer._id,
      footprintId: footprint._id,
    })).toBe(1);
  });

  test('read endpoints return 404 for a hidden footprint and 400 for oversized imports', async () => {
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const hidden = await createFootprint(author._id, { visibility: 'private' });
    const token = tokenFor(viewer);

    const hiddenResponse = await request(app)
      .put(`/api/footprints/${hidden.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(hiddenResponse.status).toBe(404);

    const importResponse = await request(app)
      .post('/api/footprints/read-state/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: Array.from({ length: 501 }, () => ({ footprintId: hidden.id, readAt: +NOW })) });
    expect(importResponse.status).toBe(400);
  });
});
