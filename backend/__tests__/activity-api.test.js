process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Friendship = require('../models/Friendship');
const { connectDB, disconnectDB, clearDB } = require('./setup');

describe('GET /api/activity', () => {
  let app;
  const now = new Date(Date.now());

  beforeAll(async () => {
    await connectDB();
    await Footprint.init();
    app = require('../index').app;
  });
  afterAll(disconnectDB);
  afterEach(clearDB);

  async function user(name, fields = {}) {
    return User.create({ name, password: 'hash', ...fields });
  }

  async function footprint(userId, fields = {}) {
    return Footprint.create({
      userId,
      location: { lat: 31.23, lng: 121.47 },
      realLocation: { lat: 31.2301, lng: 121.4701 },
      visibility: 'public',
      discoveryExpiresAt: new Date(+now + 86400000),
      countryCode: 'CN', regionCode: 'CN-SH',
      createdAt: new Date(+now - 60000),
      ...fields,
    });
  }

  function token(account) {
    return jwt.sign({ id: account.id, name: account.name, role: account.role }, process.env.JWT_SECRET);
  }

  test('guest smart activity returns public discovery only', async () => {
    const author = await user('guest-author');
    const visible = await footprint(author._id, { message: 'visible' });
    await footprint(author._id, { message: 'private', visibility: 'private' });
    await footprint(author._id, { message: 'friends', visibility: 'friends' });

    const response = await request(app).get('/api/activity');

    expect(response.status).toBe(200);
    expect(response.body.items.map((item) => item._id)).toEqual([visible.id]);
    expect(response.body.items[0]).toEqual(expect.objectContaining({ canInteract: false }));
  });

  test('authenticated smart activity includes self and friend footprints', async () => {
    const current = await user('current');
    const friend = await user('friend');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const own = await footprint(current._id, { message: 'own', visibility: 'private' });
    const friends = await footprint(friend._id, { message: 'friend', visibility: 'friends' });

    const response = await request(app)
      .get('/api/activity?scope=smart')
      .set('Authorization', `Bearer ${token(current)}`);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item) => item._id).sort()).toEqual([own.id, friends.id].sort());
    expect(response.body.items.every((item) => item.canInteract)).toBe(true);
  });

  test.each([
    ['region', 'countryCode=CN&regionCode=CN-SH'],
    ['country', 'countryCode=CN'],
    ['global', ''],
  ])('supports fixed %s scope', async (scope, query) => {
    const author = await user(`scope-${scope}`);
    const item = await footprint(author._id, { countryCode: 'CN', regionCode: 'CN-SH' });
    const response = await request(app).get(`/api/activity?scope=${scope}${query ? `&${query}` : ''}`);
    expect(response.status).toBe(200);
    expect(response.body.scope).toBe(scope);
    expect(response.body.items.map((entry) => entry._id)).toContain(item.id);
  });

  test('opaque cursor paginates without duplicate items', async () => {
    const author = await user('cursor-author');
    const first = await footprint(author._id, { message: 'first', createdAt: new Date(+now - 1000) });
    const second = await footprint(author._id, { message: 'second', createdAt: new Date(+now - 2000) });
    const pageOne = await request(app).get('/api/activity?scope=global&limit=1');
    const pageTwo = await request(app).get(`/api/activity?scope=global&limit=1&cursor=${encodeURIComponent(pageOne.body.nextCursor)}`);
    expect(pageOne.status).toBe(200);
    expect(pageTwo.status).toBe(200);
    expect(pageOne.body.items[0]._id).toBe(first.id);
    expect(pageTwo.body.items[0]._id).toBe(second.id);
    expect(pageOne.body.items[0]._id).not.toBe(pageTwo.body.items[0]._id);
  });

  test.each([
    'scope=bogus', 'scope=region', 'scope=country', 'scope=global&countryCode=CN',
    'scope=country&regionCode=CN-SH', 'limit=0', 'limit=51', 'cursor=bad', 'unknown=x',
  ])('rejects invalid activity query: %s', async (query) => {
    const response = await request(app).get(`/api/activity?${query}`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({ error: 'Invalid activity query' }));
  });

  test('forwards service failures to the global error handler', async () => {
    const service = require('../services/ActivityService');
    const failure = new Error('activity unavailable');
    const spy = jest.spyOn(service, 'listActivity').mockRejectedValueOnce(failure);
    try {
      const response = await request(app).get('/api/activity');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'activity unavailable' });
    } finally {
      spy.mockRestore();
    }
  });
});
