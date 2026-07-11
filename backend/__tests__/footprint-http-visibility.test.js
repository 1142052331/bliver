process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.SENTRY_DSN = '';

jest.mock('../services/push', () => ({ sendPushToUser: jest.fn() }));

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Friendship = require('../models/Friendship');
const Notification = require('../models/Notification');
const { connectDB, disconnectDB, clearDB } = require('./setup');

const DAY = 24 * 60 * 60 * 1000;

describe('legacy footprint HTTP visibility', () => {
  let app;

  beforeAll(async () => {
    await connectDB();
    app = express();
    app.use(express.json());
    app.use('/api', require('../routes/api'));
    app.use('/api', require('../routes/profile'));
    app.use(require('../middleware/errorHandler'));
  });
  afterAll(disconnectDB);
  afterEach(clearDB);

  async function createUser(name, fields = {}) {
    return User.create({ name, password: 'hash', ...fields });
  }

  async function createFootprint(userId, fields = {}) {
    const now = new Date();
    return Footprint.create({
      userId,
      location: { lat: 31.23, lng: 121.47 },
      realLocation: { lat: 31.2301, lng: 121.4701 },
      message: fields.message || 'footprint',
      visibility: 'public',
      discoveryExpiresAt: new Date(+now + DAY),
      createdAt: now,
      ...fields,
    });
  }

  function tokenFor(user) {
    return jwt.sign({ id: user.id, name: user.name, role: user.role }, process.env.JWT_SECRET);
  }

  function auth(user) {
    return { Authorization: `Bearer ${tokenFor(user)}` };
  }

  async function acceptFriends(left, right) {
    await Friendship.create({ requester: left._id, recipient: right._id, status: 'accepted' });
  }

  test('today filters guests, accepted friends, owners, and explicit admins through one policy', async () => {
    const owner = await createUser('owner');
    const friend = await createUser('friend');
    const stranger = await createUser('stranger');
    const admin = await createUser('admin', { role: 'admin' });
    await acceptFriends(owner, friend);

    const active = await createFootprint(owner._id, { message: 'active' });
    const expired = await createFootprint(owner._id, {
      message: 'expired', discoveryExpiresAt: new Date(Date.now() - DAY),
    });
    const friendsOnly = await createFootprint(owner._id, { message: 'friends', visibility: 'friends' });
    const privateFootprint = await createFootprint(owner._id, { message: 'private', visibility: 'private' });
    const legacy = await createFootprint(stranger._id, {
      message: 'legacy', visibility: undefined, discoveryExpiresAt: undefined,
    });

    const guest = await request(app).get('/api/footprints/today');
    expect(guest.status).toBe(200);
    expect(guest.body.footprints.map((item) => item._id)).toEqual(expect.arrayContaining([active.id, legacy.id]));
    expect(guest.body.footprints).toHaveLength(2);

    const friendResponse = await request(app).get('/api/footprints/today').set(auth(friend));
    expect(friendResponse.body.footprints.map((item) => item._id)).toEqual(
      expect.arrayContaining([active.id, expired.id, friendsOnly.id, legacy.id]),
    );
    expect(friendResponse.body.footprints.some((item) => item._id === privateFootprint.id)).toBe(false);

    const ownerResponse = await request(app).get('/api/footprints/today').set(auth(owner));
    expect(ownerResponse.body.footprints.map((item) => item._id)).toEqual(
      expect.arrayContaining([active.id, expired.id, friendsOnly.id, privateFootprint.id, legacy.id]),
    );

    const adminResponse = await request(app)
      .get(`/api/footprints/today?userId=${owner.id}`)
      .set(auth(admin));
    expect(adminResponse.body.footprints.map((item) => item._id)).toEqual(
      expect.arrayContaining([active.id, expired.id, friendsOnly.id, privateFootprint.id]),
    );
    expect(adminResponse.body.footprints.some((item) => item._id === legacy.id)).toBe(false);
  });

  test('detail returns privacy-safe 404 and strips operational location fields for ordinary viewers', async () => {
    const owner = await createUser('owner');
    const stranger = await createUser('stranger');
    const active = await createFootprint(owner._id);
    const hidden = await createFootprint(owner._id, { visibility: 'private' });

    const visibleResponse = await request(app).get(`/api/footprints/${active.id}`);
    expect(visibleResponse.status).toBe(200);
    expect(visibleResponse.body.footprint.realLocation).toBeUndefined();
    expect(visibleResponse.body.footprint.regionBackfill).toBeUndefined();

    for (const id of [hidden.id, new Footprint()._id.toString(), 'not-an-object-id']) {
      const response = await request(app).get(`/api/footprints/${id}`).set(auth(stranger));
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    }
  });

  test('today sorts equal timestamps by descending footprint id', async () => {
    const owner = await createUser('owner');
    const createdAt = new Date();
    const first = await createFootprint(owner._id, { message: 'first', createdAt });
    const second = await createFootprint(owner._id, { message: 'second', createdAt });

    const response = await request(app).get('/api/footprints/today');

    expect(response.status).toBe(200);
    expect(response.body.footprints.map((item) => item._id)).toEqual([second.id, first.id]);
  });

  test('today year query applies guest authorization in Mongo and preserves strict order', async () => {
    const owner = await createUser('owner');
    const createdAt = new Date(new Date().getFullYear(), 0, 2, 12);
    const first = await createFootprint(owner._id, { message: 'first', createdAt });
    const second = await createFootprint(owner._id, { message: 'second', createdAt });
    await createFootprint(owner._id, { message: 'hidden', visibility: 'private', createdAt });
    await createFootprint(owner._id, {
      message: 'expired', createdAt, discoveryExpiresAt: new Date(Date.now() - DAY),
    });
    const findSafeSpy = jest.spyOn(Footprint, 'findSafe');
    try {
      const response = await request(app).get('/api/footprints/today?period=year');
      expect(response.status).toBe(200);
      expect(response.body.footprints.map((item) => item._id)).toEqual([second.id, first.id]);
      expect(JSON.stringify(findSafeSpy.mock.calls[0][0])).toContain('visibility');
    } finally {
      findSafeSpy.mockRestore();
    }
  });

  test.each([
    ['reaction', 'post', 'react', { emoji: 'like' }],
    ['comment', 'post', 'comment', { content: 'hidden comment' }],
  ])('%s denial happens before mutation or notification', async (_name, method, suffix, body) => {
    const owner = await createUser('owner');
    const stranger = await createUser('stranger');
    const hidden = await createFootprint(owner._id, { visibility: 'private' });

    const response = await request(app)[method](`/api/footprints/${hidden.id}/${suffix}`)
      .set(auth(stranger))
      .send(body);

    expect(response.status).toBe(404);
    const stored = await Footprint.findById(hidden._id);
    expect(stored.reactions).toHaveLength(0);
    expect(stored.comments).toHaveLength(0);
    expect(await Notification.countDocuments()).toBe(0);
  });

  test('authorized friend interactions retain mutations and notifications', async () => {
    const owner = await createUser('owner');
    const friend = await createUser('friend');
    await acceptFriends(owner, friend);
    const footprint = await createFootprint(owner._id, {
      visibility: 'friends', discoveryExpiresAt: new Date(Date.now() - DAY),
    });

    expect((await request(app)
      .post(`/api/footprints/${footprint.id}/react`)
      .set(auth(friend))
      .send({ emoji: 'like' })).status).toBe(200);
    expect((await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(friend))
      .send({ content: 'allowed' })).status).toBe(201);

    const stored = await Footprint.findById(footprint._id);
    expect(stored.reactions).toHaveLength(1);
    expect(stored.reactions[0].createdAt).toBeInstanceOf(Date);
    expect(stored.comments).toHaveLength(1);
    expect(await Notification.countDocuments()).toBe(2);
  });

  test('owner and admin interactions preserve notification side effects', async () => {
    const owner = await createUser('owner');
    const admin = await createUser('admin', { role: 'admin' });
    const privateFootprint = await createFootprint(owner._id, { visibility: 'private' });

    expect((await request(app).post(`/api/footprints/${privateFootprint.id}/react`)
      .set(auth(owner)).send({ emoji: 'like' })).status).toBe(200);
    expect((await request(app).post(`/api/footprints/${privateFootprint.id}/comment`)
      .set(auth(owner)).send({ content: 'owner comment' })).status).toBe(201);
    expect(await Notification.countDocuments()).toBe(0);

    expect((await request(app).post(`/api/footprints/${privateFootprint.id}/react`)
      .set(auth(admin)).send({ emoji: 'heart' })).status).toBe(200);
    expect((await request(app).post(`/api/footprints/${privateFootprint.id}/comment`)
      .set(auth(admin)).send({ content: 'admin comment' })).status).toBe(201);
    expect(await Notification.countDocuments()).toBe(2);
  });

  test('comment deletion authorizes footprint readability before comment ownership', async () => {
    const owner = await createUser('owner');
    const stranger = await createUser('stranger');
    const hidden = await createFootprint(owner._id, {
      visibility: 'private',
      comments: [{ userId: stranger._id, username: stranger.name, content: 'mine but hidden' }],
    });
    const commentId = hidden.comments[0]._id.toString();

    const response = await request(app)
      .delete(`/api/footprints/${hidden.id}/comments/${commentId}`)
      .set(auth(stranger));

    expect(response.status).toBe(404);
    expect((await Footprint.findById(hidden._id)).comments).toHaveLength(1);
  });

  test('readable comment deletion preserves author and superuser rules', async () => {
    const owner = await createUser('owner');
    const author = await createUser('author');
    const other = await createUser('other');
    const superuser = await createUser('阿森');
    const footprint = await createFootprint(owner._id, {
      comments: [
        { userId: author._id, username: author.name, content: 'author comment' },
        { userId: other._id, username: other.name, content: 'other comment' },
      ],
    });

    const forbidden = await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/${footprint.comments[1]._id}`)
      .set(auth(author));
    expect(forbidden.status).toBe(403);

    const ownDelete = await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/${footprint.comments[0]._id}`)
      .set(auth(author));
    expect(ownDelete.status).toBe(200);

    const superuserDelete = await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/${footprint.comments[1]._id}`)
      .set(auth(superuser));
    expect(superuserDelete.status).toBe(200);
    expect((await Footprint.findById(footprint._id)).comments).toHaveLength(0);
  });

  test('interaction routes return privacy-safe 404 for invalid object ids', async () => {
    const viewer = await createUser('viewer');
    const footprint = await createFootprint(viewer._id);
    const token = auth(viewer);

    expect((await request(app)
      .post('/api/footprints/not-an-object-id/react')
      .set(token)
      .send({ emoji: 'like' })).status).toBe(404);
    expect((await request(app)
      .post('/api/footprints/not-an-object-id/comment')
      .set(token)
      .send({ content: 'comment' })).status).toBe(404);
    expect((await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/not-an-object-id`)
      .set(token)).status).toBe(404);
  });

  test('profile aggregates never let a public profile override footprint visibility', async () => {
    const target = await createUser('target');
    const viewer = await createUser('viewer');
    const author = await createUser('author');
    const admin = await createUser('admin', { role: 'admin' });
    await acceptFriends(viewer, author);

    const ownActive = await createFootprint(target._id, { message: 'own active' });
    const ownLegacyNull = await createFootprint(target._id, {
      message: 'own legacy null', visibility: null, discoveryExpiresAt: null,
    });
    const ownPrivate = await createFootprint(target._id, { message: 'own private', visibility: 'private' });
    const reactedActive = await createFootprint(author._id, {
      message: 'reacted active', reactions: [{ userId: target._id, username: target.name, emoji: 'like' }],
    });
    const reactedExpired = await createFootprint(author._id, {
      message: 'reacted expired', discoveryExpiresAt: new Date(Date.now() - DAY),
      reactions: [{ userId: target._id, username: target.name, emoji: 'like' }],
    });
    const commentedFriends = await createFootprint(author._id, {
      message: 'commented friends', visibility: 'friends',
      comments: [{ userId: target._id, username: target.name, content: 'hello' }],
    });
    const commentedPrivate = await createFootprint(author._id, {
      message: 'commented private', visibility: 'private',
      comments: [{ userId: target._id, username: target.name, content: 'secret' }],
    });

    const guest = await request(app).get(`/api/users/${target.id}/profile`);
    expect(guest.body.footprints.map((item) => item._id)).toEqual([ownLegacyNull.id, ownActive.id]);
    expect(guest.body.recentReactions.map((item) => item._id)).toEqual([reactedActive.id]);
    expect(guest.body.recentComments).toHaveLength(0);

    const friend = await request(app).get(`/api/users/${target.id}/profile`).set(auth(viewer));
    expect(friend.body.recentReactions.map((item) => item._id)).toEqual(
      expect.arrayContaining([reactedActive.id, reactedExpired.id]),
    );
    expect(friend.body.recentComments.map((item) => item._id)).toEqual([commentedFriends.id]);
    expect(friend.body.recentComments.some((item) => item._id === commentedPrivate.id)).toBe(false);

    const owner = await request(app).get(`/api/users/${target.id}/profile`).set(auth(target));
    expect(owner.body.footprints.map((item) => item._id)).toEqual(expect.arrayContaining([ownActive.id, ownPrivate.id]));

    const adminResponse = await request(app).get(`/api/users/${target.id}/profile`).set(auth(admin));
    expect(adminResponse.body.footprints.map((item) => item._id)).toEqual(expect.arrayContaining([ownActive.id, ownPrivate.id]));
    expect(adminResponse.body.recentComments.map((item) => item._id)).toEqual(
      expect.arrayContaining([commentedFriends.id, commentedPrivate.id]),
    );
    expect(adminResponse.body.recentComments[0].realLocation).toBeUndefined();
    expect(adminResponse.body.recentComments[0].regionBackfill).toBeDefined();
  });

  test('profile user DTO never leaks operational fields and gates visitors to owner/admin', async () => {
    const visitor = await createUser('visitor');
    const target = await createUser('target', {
      registerIp: '10.0.0.1',
      lastLoginIp: '10.0.0.2',
      lastLoginAt: new Date(),
      footprintReadBaselineAt: new Date(),
      lastFootprintVisibility: 'private',
      profileVisitors: [{ visitorId: visitor._id, visitedAt: new Date() }],
    });
    const stranger = await createUser('stranger');
    const admin = await createUser('admin', { role: 'admin' });
    const forbiddenFields = [
      'password', 'registerIp', 'lastLoginIp', 'lastLoginAt',
      'footprintReadBaselineAt', 'lastFootprintVisibility',
    ];

    const responses = {
      guest: await request(app).get(`/api/users/${target.id}/profile`),
      stranger: await request(app).get(`/api/users/${target.id}/profile`).set(auth(stranger)),
      owner: await request(app).get(`/api/users/${target.id}/profile`).set(auth(target)),
      admin: await request(app).get(`/api/users/${target.id}/profile`).set(auth(admin)),
    };
    for (const response of Object.values(responses)) {
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ _id: target.id, name: target.name });
      for (const field of forbiddenFields) expect(response.body.user[field]).toBeUndefined();
    }
    expect(responses.guest.body.user.profileVisitors).toBeUndefined();
    expect(responses.stranger.body.user.profileVisitors).toBeUndefined();
    expect(responses.owner.body.user.profileVisitors.map((item) => item.visitorId._id)).toContain(visitor.id);
    expect(responses.admin.body.user.profileVisitors.map((item) => item.visitorId._id)).toContain(visitor.id);

    const reactionResponse = await request(app)
      .post(`/api/users/${target.id}/profile/react`)
      .set(auth(stranger))
      .send({ emoji: 'like' });
    expect(reactionResponse.status).toBe(200);
    for (const field of forbiddenFields) expect(reactionResponse.body.user[field]).toBeUndefined();
  });

  test('public profile history queries are bounded at the database', async () => {
    const target = await createUser('target');
    const limitSpy = jest.spyOn(mongoose.Query.prototype, 'limit');
    const aggregateLimitSpy = jest.spyOn(mongoose.Aggregate.prototype, 'limit');
    const findSafeSpy = jest.spyOn(Footprint, 'findSafe');
    try {
      const response = await request(app).get(`/api/users/${target.id}/profile`);
      expect(response.status).toBe(200);
      expect(limitSpy.mock.calls.filter(([value]) => value === 50)).toHaveLength(1);
      expect(aggregateLimitSpy.mock.calls.filter(([value]) => value === 5)).toHaveLength(2);
      expect(JSON.stringify(findSafeSpy.mock.calls[0][0])).toContain('visibility');
    } finally {
      limitSpy.mockRestore();
      aggregateLimitSpy.mockRestore();
      findSafeSpy.mockRestore();
    }
  });

  test('profile recent comments sort by the latest matching comment event', async () => {
    const target = await createUser('target');
    const author = await createUser('author');
    const now = new Date();
    const olderFootprintWithNewestComment = await createFootprint(author._id, {
      message: 'older footprint, newest comment',
      createdAt: new Date(+now - 2 * DAY),
      discoveryExpiresAt: new Date(+now + DAY),
      comments: [{
        userId: target._id, username: target.name, content: 'newest', createdAt: now,
      }],
    });
    const newerFootprintWithOldComment = await createFootprint(author._id, {
      message: 'newer footprint, old comment',
      createdAt: new Date(+now - DAY),
      discoveryExpiresAt: new Date(+now + DAY),
      comments: [{
        userId: target._id, username: target.name, content: 'old',
        createdAt: new Date(+now - 3 * DAY),
      }],
    });

    const response = await request(app).get(`/api/users/${target.id}/profile`);

    expect(response.status).toBe(200);
    expect(response.body.recentComments.map((item) => item._id)).toEqual([
      olderFootprintWithNewestComment.id,
      newerFootprintWithOldComment.id,
    ]);
  });

  test('profile recent comments break equal event timestamps by descending footprint id', async () => {
    const target = await createUser('target');
    const author = await createUser('author');
    const commentAt = new Date();
    const first = await createFootprint(author._id, {
      comments: [{ userId: target._id, username: target.name, content: 'first', createdAt: commentAt }],
    });
    const second = await createFootprint(author._id, {
      comments: [{ userId: target._id, username: target.name, content: 'second', createdAt: commentAt }],
    });

    const response = await request(app).get(`/api/users/${target.id}/profile`);

    expect(response.status).toBe(200);
    expect(response.body.recentComments.map((item) => item._id)).toEqual([second.id, first.id]);
  });

  test('profile comments trust userId and use username only for legacy missing ids', async () => {
    const target = await createUser('$target');
    const imposter = await createUser('imposter');
    const author = await createUser('author');
    const misattributed = await createFootprint(author._id, {
      message: 'wrong id',
      comments: [{ userId: imposter._id, username: target.name, content: 'not target' }],
    });
    const legacy = await createFootprint(author._id, {
      message: 'legacy target',
      comments: [{ username: target.name, content: 'legacy target' }],
    });

    const response = await request(app).get(`/api/users/${target.id}/profile`);

    expect(response.status).toBe(200);
    expect(response.body.recentComments.map((item) => item._id)).toEqual([legacy.id]);
    expect(response.body.recentComments.some((item) => item._id === misattributed.id)).toBe(false);
  });

  test('profile recent reactions sort by the latest matching reaction event', async () => {
    const target = await createUser('target');
    const author = await createUser('author');
    const now = new Date();
    const olderFootprintWithNewestReaction = await createFootprint(author._id, {
      createdAt: new Date(+now - 2 * DAY), discoveryExpiresAt: new Date(+now + DAY),
      reactions: [{ userId: target._id, username: target.name, emoji: 'like', createdAt: now }],
    });
    const newerFootprintWithOldReaction = await createFootprint(author._id, {
      createdAt: new Date(+now - DAY), discoveryExpiresAt: new Date(+now + DAY),
      reactions: [{
        userId: target._id, username: target.name, emoji: 'heart', createdAt: new Date(+now - 3 * DAY),
      }],
    });

    const response = await request(app).get(`/api/users/${target.id}/profile`);

    expect(response.status).toBe(200);
    expect(response.body.recentReactions.map((item) => item._id)).toEqual([
      olderFootprintWithNewestReaction.id,
      newerFootprintWithOldReaction.id,
    ]);
  });

  test('reaction timestamps and profile lookup indexes are declared', () => {
    expect(Footprint.schema.path('reactions').schema.path('createdAt')?.defaultValue).toBeDefined();
    const indexes = Footprint.schema.indexes().map(([fields]) => fields);
    expect(indexes).toEqual(expect.arrayContaining([
      { 'reactions.userId': 1, 'reactions.createdAt': -1 },
      { 'comments.userId': 1, 'comments.createdAt': -1 },
    ]));
  });

  test('profile history prefilters hidden rows in one bounded query', async () => {
    const target = await createUser('target');
    const olderActive = await createFootprint(target._id, {
      message: 'older active', createdAt: new Date(Date.now() - DAY),
      discoveryExpiresAt: new Date(Date.now() + DAY),
    });
    await Footprint.insertMany(Array.from({ length: 5 }, (_, index) => ({
      userId: target._id,
      location: { lat: 31.23, lng: 121.47 },
      message: `hidden ${index}`,
      visibility: 'private',
      createdAt: new Date(Date.now() - index * 1000),
    })));

    const limitSpy = jest.spyOn(mongoose.Query.prototype, 'limit');
    const aggregateLimitSpy = jest.spyOn(mongoose.Aggregate.prototype, 'limit');
    try {
      const response = await request(app).get(`/api/users/${target.id}/profile`);
      expect(response.status).toBe(200);
      expect(response.body.footprints.map((item) => item._id)).toEqual([olderActive.id]);
      expect(limitSpy.mock.calls.filter(([value]) => value === 50)).toHaveLength(1);
      expect(aggregateLimitSpy.mock.calls.filter(([value]) => value === 5)).toHaveLength(2);
    } finally {
      limitSpy.mockRestore();
      aggregateLimitSpy.mockRestore();
    }
  });
});
