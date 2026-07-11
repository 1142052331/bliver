process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

jest.mock('../services/push', () => ({ sendPushToUser: jest.fn() }));
jest.mock('../services/nominatim', () => ({
  reverseGeocode: jest.fn(),
  reverseGeocodeStructured: jest.fn(),
  searchPlaces: jest.fn(),
}));

const request = require('supertest');
const { normalizeMapQuery } = require('../validators/mapQuery');
const footprintQueryService = require('../services/FootprintQueryService');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Friendship = require('../models/Friendship');
const { connectDB, disconnectDB, clearDB } = require('./setup');

const NOW = new Date('2026-07-11T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('normalizeMapQuery', () => {
  test('normalizes map query defaults', () => {
    expect(normalizeMapQuery({})).toEqual({
      scope: 'smart',
      relationship: 'all',
      period: '7d',
      content: 'all',
      query: '',
      limit: 500,
    });
  });

  test.each([
    [{ scope: 'nearby' }],
    [{ relationship: 'followers' }],
    [{ period: 'forever' }],
    [{ content: 'video' }],
    [{ limit: 0 }],
    [{ limit: 501 }],
    [{ query: 'x'.repeat(81) }],
    [{ scope: 'region' }],
    [{ scope: 'country' }],
  ])('rejects unsupported or incomplete query %#', (input) => {
    expect(() => normalizeMapQuery(input)).toThrow('Invalid map query');
  });

  test('normalizes geographic codes and numeric limits', () => {
    expect(normalizeMapQuery({
      scope: 'region',
      countryCode: ' cn ',
      regionCode: ' cn-sh ',
      limit: '25',
    })).toMatchObject({ countryCode: 'CN', regionCode: 'CN-SH', limit: 25 });
  });
});

describe('FootprintQueryService.listMap', () => {
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

  async function createUser(name, fields = {}) {
    return User.create({ name, password: 'hash', ...fields });
  }

  async function createFootprint(userId, fields = {}) {
    return Footprint.create({
      userId,
      location: { lat: 31.23, lng: 121.47 },
      placeName: '上海市',
      message: '周末散步',
      visibility: 'public',
      discoveryExpiresAt: new Date(+NOW + DAY),
      countryCode: 'CN',
      countryName: '中国',
      regionCode: 'CN-SH',
      regionName: '上海市',
      createdAt: new Date(+NOW - 60_000),
      ...fields,
    });
  }

  const viewer = (user) => ({ id: user.id, name: user.name, role: user.role });

  test('guests receive only active public discovery and transitional legacy footprints', async () => {
    const author = await createUser('author');
    const active = await createFootprint(author._id, { message: 'active' });
    await createFootprint(author._id, {
      message: 'expired',
      discoveryExpiresAt: new Date(+NOW - DAY),
    });
    await createFootprint(author._id, { message: 'friends', visibility: 'friends' });
    await createFootprint(author._id, { message: 'private', visibility: 'private' });
    const legacy = await createFootprint(author._id, {
      message: 'legacy',
      visibility: undefined,
      discoveryExpiresAt: undefined,
    });

    const result = await footprintQueryService.listMap({
      viewer: null,
      query: { scope: 'global', period: 'year' },
      now: NOW,
    });

    expect(result.footprints.map((item) => item._id)).toEqual(expect.arrayContaining([active.id, legacy.id]));
    expect(result.footprints).toHaveLength(2);
  });

  test('owner and accepted friend branches retain readable non-public footprints', async () => {
    const current = await createUser('current');
    const friend = await createUser('friend');
    const stranger = await createUser('stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const ownPrivate = await createFootprint(current._id, { visibility: 'private', message: 'own' });
    const friendOnly = await createFootprint(friend._id, { visibility: 'friends', message: 'friend' });
    await createFootprint(stranger._id, { visibility: 'private', message: 'hidden' });

    const result = await footprintQueryService.listMap({
      viewer: viewer(current),
      query: { scope: 'smart', period: 'year' },
      now: NOW,
    });

    expect(result.footprints.map((item) => item._id)).toEqual(expect.arrayContaining([ownPrivate.id, friendOnly.id]));
    expect(result.footprints.find((item) => item._id === ownPrivate.id)).toMatchObject({
      relationship: 'self', sourceScope: 'self', sourceLabel: '我的', canInteract: true,
    });
    expect(result.footprints.find((item) => item._id === friendOnly.id)).toMatchObject({
      relationship: 'friend', sourceScope: 'friend', sourceLabel: '好友', canInteract: true,
    });
    expect(result.footprints.some((item) => item.message === 'hidden')).toBe(false);
  });

  test('fixed region applies geography to every authorization branch', async () => {
    const current = await createUser('current');
    const inRegion = await createFootprint(current._id, { message: 'in-region' });
    await createFootprint(current._id, {
      message: 'out-region', regionCode: 'CN-BJ', regionName: '北京市',
    });

    const result = await footprintQueryService.listMap({
      viewer: viewer(current),
      query: { scope: 'region', countryCode: 'CN', regionCode: 'CN-SH', period: 'year' },
      now: NOW,
    });

    expect(result.footprints.map((item) => item._id)).toEqual([inRegion.id]);
  });

  test('applies relationship, period, photo, and unread filters', async () => {
    const current = await createUser('current');
    const friend = await createUser('friend');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    await User.findByIdAndUpdate(current._id, { footprintReadBaselineAt: new Date(+NOW - 2 * DAY) });
    const friendPhoto = await createFootprint(friend._id, {
      photoUrl: 'https://example.com/photo.jpg',
      createdAt: new Date(+NOW - DAY),
    });
    await createFootprint(friend._id, { createdAt: new Date(+NOW - 8 * DAY) });
    await createFootprint(current._id, { photoUrl: 'https://example.com/own.jpg' });

    const result = await footprintQueryService.listMap({
      viewer: viewer(current),
      query: { scope: 'smart', relationship: 'friends', period: '7d', content: 'unread' },
      now: NOW,
    });
    expect(result.footprints.map((item) => item._id)).toEqual([friendPhoto.id]);

    const photos = await footprintQueryService.listMap({
      viewer: viewer(current),
      query: { scope: 'smart', relationship: 'friends', period: '7d', content: 'photo' },
      now: NOW,
    });
    expect(photos.footprints.map((item) => item._id)).toEqual([friendPhoto.id]);
  });

  test('sorts equal timestamps by id descending and sanitizes real coordinates', async () => {
    const author = await createUser('author');
    const createdAt = new Date(+NOW - DAY);
    const first = await createFootprint(author._id, {
      createdAt,
      realLocation: { lat: 30, lng: 120 },
      message: 'first',
    });
    const second = await createFootprint(author._id, { createdAt, message: 'second' });

    const result = await footprintQueryService.listMap({
      viewer: null,
      query: { scope: 'global', period: 'year' },
      now: NOW,
    });

    const expected = [first.id, second.id].sort().reverse();
    expect(result.footprints.map((item) => item._id)).toEqual(expected);
    expect(result.footprints.every((item) => item.realLocation === undefined)).toBe(true);
  });

  test('rejects unread filtering for guests', async () => {
    await expect(footprintQueryService.listMap({
      viewer: null,
      query: { content: 'unread' },
      now: NOW,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('keeps explicit admin visibility in smart scope', async () => {
    const admin = await createUser('admin', { role: 'admin' });
    const stranger = await createUser('stranger');
    const privateFootprint = await createFootprint(stranger._id, { visibility: 'private' });

    const result = await footprintQueryService.listMap({
      viewer: viewer(admin),
      query: { scope: 'smart', period: 'year' },
      now: NOW,
    });

    expect(result.footprints.map((item) => item._id)).toContain(privateFootprint.id);
  });

  test('GET /api/map/footprints exposes the authorized guest query', async () => {
    const author = await createUser('author');
    const footprint = await createFootprint(author._id);

    const response = await request(app).get('/api/map/footprints?scope=global&period=year');

    expect(response.status).toBe(200);
    expect(response.body.footprints.map((item) => item._id)).toEqual([footprint.id]);
  });

  test('GET /api/map/footprints returns 400 for invalid query values', async () => {
    const response = await request(app).get('/api/map/footprints?period=forever');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid map query');
  });

  test('POST /api/map/location-context returns structured region data', async () => {
    const { reverseGeocodeStructured } = require('../services/nominatim');
    reverseGeocodeStructured.mockResolvedValueOnce({
      displayName: '上海市',
      countryCode: 'CN',
      countryName: '中国',
      regionCode: 'CN-SH',
      regionName: '上海市',
    });

    const response = await request(app)
      .post('/api/map/location-context')
      .send({ lat: 31.23, lng: 121.47 });

    expect(response.status).toBe(200);
    expect(response.body.location).toMatchObject({ countryCode: 'CN', regionCode: 'CN-SH' });
    expect(reverseGeocodeStructured).toHaveBeenCalledWith(31.23, 121.47);
  });

  test('POST /api/map/location-context rejects an empty body as invalid coordinates', async () => {
    const response = await request(app).post('/api/map/location-context').send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid coordinates');
  });
});
