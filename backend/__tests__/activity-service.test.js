const mongoose = require('mongoose');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Friendship = require('../models/Friendship');
const { encodeActivityCursor } = require('../services/ActivityCursor');
const { normalizeActivityQuery } = require('../validators/activityQuery');
const { getViewerAccess } = require('../services/FootprintAccessService');
const { connectDB, disconnectDB, clearDB } = require('./setup');

const NOW = new Date('2026-07-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('ActivityService.listActivity', () => {
  let activityService;

  beforeAll(async () => {
    await connectDB();
    await Footprint.init();
    activityService = require('../services/ActivityService');
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
      realLocation: { lat: 31.2301, lng: 121.4701 },
      placeName: 'Shanghai',
      message: `footprint-${new mongoose.Types.ObjectId()}`,
      visibility: 'public',
      discoveryExpiresAt: new Date(+NOW + DAY),
      countryCode: 'CN',
      countryName: 'China',
      regionCode: 'CN-SH',
      regionName: 'Shanghai',
      createdAt: new Date(+NOW - 60_000),
      ...fields,
    });
  }

  const viewer = (user) => ({ id: user.id, name: user.name, role: user.role });
  const ids = (result) => result.items.map((item) => item._id);

  test('guests receive only active public discovery and approved legacy-public footprints', async () => {
    const author = await createUser('author');
    const active = await createFootprint(author._id, { message: 'active' });
    await createFootprint(author._id, {
      message: 'expired', discoveryExpiresAt: new Date(+NOW - DAY),
    });
    await createFootprint(author._id, { message: 'friends', visibility: 'friends' });
    await createFootprint(author._id, { message: 'private', visibility: 'private' });
    const legacyId = new mongoose.Types.ObjectId();
    await Footprint.collection.insertOne({
      _id: legacyId,
      userId: author._id,
      location: { lat: 31, lng: 121 },
      message: 'legacy',
      visibility: null,
      countryCode: 'CN',
      regionCode: 'CN-SH',
      createdAt: new Date(+NOW - 120_000),
      updatedAt: NOW,
    });

    const result = await activityService.listActivity({
      viewer: null, query: { scope: 'global' }, now: NOW,
    });

    expect(ids(result)).toEqual([active.id, legacyId.toString()]);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relationship: 'stranger', sourceScope: 'global', sourceLabel: '全球', canInteract: false,
      }),
    ]));
    expect(result).toMatchObject({
      hasMore: false,
      nextCursor: null,
      scope: 'global',
      usedScopes: ['global'],
      location: { countryCode: null, regionCode: null },
    });
  });

  test('authenticated viewers receive readable self and friend items while strangers require active public discovery', async () => {
    const current = await createUser('current');
    const friend = await createUser('friend');
    const stranger = await createUser('stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const own = await createFootprint(current._id, { visibility: 'private', message: 'own' });
    const friendOnly = await createFootprint(friend._id, {
      visibility: 'friends', message: 'friend', createdAt: new Date(+NOW - 2 * 60_000),
    });
    await createFootprint(friend._id, { visibility: 'private', message: 'friend-private' });
    await createFootprint(stranger._id, {
      message: 'expired-stranger', discoveryExpiresAt: new Date(+NOW - DAY),
    });

    const result = await activityService.listActivity({
      viewer: viewer(current), query: { scope: 'smart' }, now: NOW,
    });

    expect(ids(result)).toEqual([own.id, friendOnly.id]);
    expect(result.items[0]).toMatchObject({
      relationship: 'self', sourceScope: 'friend', sourceLabel: '好友', canInteract: true,
    });
    expect(result.items[1]).toMatchObject({
      relationship: 'friend', sourceScope: 'friend', sourceLabel: '好友', canInteract: true,
    });
  });

  test('smart scope fills friend, region, country, then global tiers and classifies duplicates deterministically', async () => {
    const current = await createUser('tier-current');
    const friend = await createUser('tier-friend');
    const stranger = await createUser('tier-stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const friendItem = await createFootprint(friend._id, {
      message: 'friend-in-region', createdAt: new Date(+NOW - 4 * 60_000),
    });
    const region = await createFootprint(stranger._id, {
      message: 'region', createdAt: new Date(+NOW - 3 * 60_000),
    });
    const country = await createFootprint(stranger._id, {
      message: 'country', regionCode: 'CN-BJ', createdAt: new Date(+NOW - 2 * 60_000),
    });
    const global = await createFootprint(stranger._id, {
      message: 'global', countryCode: 'US', regionCode: 'US-CA', createdAt: new Date(+NOW - 60_000),
    });

    const result = await activityService.listActivity({
      viewer: viewer(current),
      query: { scope: 'smart', countryCode: 'cn', regionCode: 'cn-sh', limit: 4 },
      now: NOW,
    });

    expect(ids(result)).toEqual([global.id, country.id, region.id, friendItem.id]);
    expect(result.items.map((item) => item.sourceScope)).toEqual(['global', 'country', 'region', 'friend']);
    expect(result.usedScopes).toEqual(['friend', 'region', 'country', 'global']);
    expect(new Set(ids(result)).size).toBe(4);
    expect(result.location).toEqual({ countryCode: 'CN', regionCode: 'CN-SH' });
  });

  test('tier priority controls inclusion while chronology controls only selected item ordering', async () => {
    const current = await createUser('priority-current');
    const friend = await createUser('priority-friend');
    const stranger = await createUser('priority-stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const friendItem = await createFootprint(friend._id, {
      visibility: 'friends', message: 'older-friend', createdAt: new Date(+NOW - 4 * 60_000),
    });
    const regionItem = await createFootprint(stranger._id, {
      message: 'region', createdAt: new Date(+NOW - 3 * 60_000),
    });
    await createFootprint(stranger._id, {
      message: 'newer-country', regionCode: 'CN-BJ', createdAt: new Date(+NOW - 2 * 60_000),
    });

    const result = await activityService.listActivity({
      viewer: viewer(current),
      query: { scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 2 },
      now: NOW,
    });

    expect(ids(result)).toEqual([regionItem.id, friendItem.id]);
    expect(result.hasMore).toBe(true);
  });

  test('smart scope without location uses friend then global tiers', async () => {
    const current = await createUser('fallback-current');
    const friend = await createUser('fallback-friend');
    const stranger = await createUser('fallback-stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    await createFootprint(friend._id, { visibility: 'friends', message: 'friend' });
    await createFootprint(stranger._id, { countryCode: 'US', regionCode: 'US-NY', message: 'global' });

    const result = await activityService.listActivity({
      viewer: viewer(current), query: { scope: 'smart', limit: 5 }, now: NOW,
    });

    expect(result.usedScopes).toEqual(['friend', 'global']);
    expect(result.items).toHaveLength(2);
  });

  test.each([
    ['region', { countryCode: 'CN', regionCode: 'CN-SH' }, 'in-region'],
    ['country', { countryCode: 'CN' }, 'in-country'],
  ])('fixed %s applies geography to all authorization branches and never supplements', async (scope, geography, includedMessage) => {
    const current = await createUser(`${scope}-current`);
    const friend = await createUser(`${scope}-friend`);
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    await createFootprint(friend._id, { visibility: 'friends', message: includedMessage });
    await createFootprint(current._id, {
      visibility: 'private', message: 'out-country', countryCode: 'US', regionCode: 'US-CA',
    });
    if (scope === 'region') {
      await createFootprint(current._id, { visibility: 'private', message: 'out-region', regionCode: 'CN-BJ' });
    }

    const result = await activityService.listActivity({
      viewer: viewer(current), query: { scope, ...geography, limit: 10 }, now: NOW,
    });

    expect(result.items.map((item) => item.message)).toEqual([includedMessage]);
  });

  test('fixed global returns all authorized content without geography filtering', async () => {
    const current = await createUser('global-current');
    const friend = await createUser('global-friend');
    const stranger = await createUser('global-stranger');
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const own = await createFootprint(current._id, {
      visibility: 'private', countryCode: 'US', regionCode: 'US-NY', message: 'own',
    });
    const friendItem = await createFootprint(friend._id, { visibility: 'friends', message: 'friend' });
    const publicItem = await createFootprint(stranger._id, { countryCode: 'JP', regionCode: 'JP-13', message: 'public' });

    const result = await activityService.listActivity({
      viewer: viewer(current), query: { scope: 'global' }, now: NOW,
    });

    expect(ids(result)).toEqual(expect.arrayContaining([own.id, friendItem.id, publicItem.id]));
    expect(result.items).toHaveLength(3);
  });

  test('admin explicitly reads private stranger items and fixed geography still applies', async () => {
    const admin = await createUser('admin', { role: 'admin' });
    const stranger = await createUser('admin-stranger');
    const inRegion = await createFootprint(stranger._id, {
      visibility: 'private', discoveryExpiresAt: null, message: 'in-region',
    });
    await createFootprint(stranger._id, {
      visibility: 'private', discoveryExpiresAt: null, regionCode: 'CN-BJ', message: 'out-region',
    });

    const result = await activityService.listActivity({
      viewer: viewer(admin),
      query: { scope: 'region', countryCode: 'CN', regionCode: 'CN-SH' },
      now: NOW,
    });

    expect(ids(result)).toEqual([inRegion.id]);
    expect(result.items[0]).toMatchObject({ relationship: 'stranger', sourceScope: 'region', canInteract: true });
  });

  test('strict chronology and createdAt plus id cursor avoid equal-timestamp duplicates or omissions', async () => {
    const author = await createUser('cursor-author');
    const createdAt = new Date(+NOW - 60_000);
    const docs = [];
    for (let index = 0; index < 5; index += 1) {
      docs.push(await createFootprint(author._id, { createdAt, message: `same-${index}` }));
    }
    const expected = docs.map((doc) => doc.id).sort().reverse();

    const first = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2 }, now: NOW,
    });
    const second = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2, cursor: first.nextCursor }, now: NOW,
    });
    const third = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2, cursor: second.nextCursor }, now: NOW,
    });

    expect([...ids(first), ...ids(second), ...ids(third)]).toEqual(expected);
    expect(first).toMatchObject({ hasMore: true });
    expect(second).toMatchObject({ hasMore: true });
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
  });

  test('hasMore and nextCursor are correct for exhausted, exact-limit, and over-limit results', async () => {
    const author = await createUser('page-author');
    await createFootprint(author._id, { message: 'one' });
    await createFootprint(author._id, { message: 'two', createdAt: new Date(+NOW - 2 * 60_000) });

    const exact = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2 }, now: NOW,
    });
    expect(exact).toMatchObject({ hasMore: false, nextCursor: null });

    await createFootprint(author._id, { message: 'three', createdAt: new Date(+NOW - 3 * 60_000) });
    const over = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2 }, now: NOW,
    });
    expect(over.hasMore).toBe(true);
    expect(typeof over.nextCursor).toBe('string');
    expect(over.nextCursor).toBe(encodeActivityCursor(over.items[1]));

    const exhausted = await activityService.listActivity({
      viewer: null, query: { scope: 'global', limit: 2, cursor: over.nextCursor }, now: NOW,
    });
    expect(exhausted).toMatchObject({ hasMore: false, nextCursor: null });
  });

  test('normalizes before querying, populates users, and strips precise and operational location fields', async () => {
    const author = await createUser('sanitize-author', { avatarUrl: 'https://example.com/avatar.png' });
    await createFootprint(author._id, {
      regionBackfill: { status: 'failed', attempts: 4, error: 'secret operational detail' },
    });

    const result = await activityService.listActivity({
      viewer: null,
      query: { scope: 'region', countryCode: ' cn ', regionCode: ' cn-sh ', limit: '1' },
      now: NOW,
    });

    expect(result.items[0].userId).toMatchObject({ name: 'sanitize-author' });
    expect(result.items[0]).not.toHaveProperty('realLocation');
    expect(result.items[0]).not.toHaveProperty('regionBackfill');
    expect(result.location).toEqual({ countryCode: 'CN', regionCode: 'CN-SH' });
  });

  test('candidate queries use Activity sort indexes without a blocking sort', async () => {
    await Footprint.syncIndexes();
    const current = await createUser('explain-current');
    const friend = await createUser('explain-friend');
    const admin = await createUser('explain-admin', { role: 'admin' });
    await Friendship.create({ requester: current._id, recipient: friend._id, status: 'accepted' });
    const rows = [];
    for (let index = 0; index < 240; index += 1) {
      rows.push({
        userId: index % 7 === 0 ? friend._id : new mongoose.Types.ObjectId(),
        location: { lat: 31, lng: 121 },
        visibility: index % 11 === 0 ? 'friends' : 'public',
        discoveryExpiresAt: new Date(+NOW + DAY),
        countryCode: index % 3 === 0 ? 'US' : 'CN',
        regionCode: index % 5 === 0 ? 'CN-BJ' : 'CN-SH',
        createdAt: new Date(+NOW - index * 1000),
        updatedAt: NOW,
      });
    }
    await Footprint.collection.insertMany(rows);

    function collectPlanDetails(value, details = { stages: [], indexes: [] }) {
      if (!value || typeof value !== 'object') return details;
      if (typeof value.stage === 'string') details.stages.push(value.stage);
      if (typeof value.indexName === 'string') details.indexes.push(value.indexName);
      for (const child of Object.values(value)) collectPlanDetails(child, details);
      return details;
    }

    async function explainTier({ who, query, tierIndex = 0 }) {
      const normalized = normalizeActivityQuery(query);
      const access = await getViewerAccess(who);
      const cursor = normalized.cursor
        ? require('../services/ActivityCursor').decodeActivityCursor(normalized.cursor)
        : null;
      const tiers = activityService.buildCandidateTiers({ access, normalized, now: NOW, cursor });
      let mongoQuery = Footprint.find(tiers[tierIndex].filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(10);
      if (tiers[tierIndex].hint) mongoQuery = mongoQuery.hint(tiers[tierIndex].hint);
      const explanation = await mongoQuery.explain('executionStats');
      return collectPlanDetails(explanation.queryPlanner.winningPlan);
    }

    const cursor = encodeActivityCursor({
      createdAt: new Date(+NOW - 30_000),
      _id: new mongoose.Types.ObjectId(),
    });
    const cases = [
      [null, { scope: 'global' }, 'activity_public_createdAt_id_expiry'],
      [null, { scope: 'country', countryCode: 'CN' }, 'activity_country_public_createdAt_id_expiry'],
      [null, { scope: 'region', countryCode: 'CN', regionCode: 'CN-SH' }, 'activity_region_public_createdAt_id_expiry'],
      [viewer(current), { scope: 'global' }, 'userId_1_createdAt_-1__id_-1'],
      [viewer(admin), { scope: 'global', cursor }, 'activity_createdAt_id'],
      [viewer(admin), { scope: 'smart', cursor }, 'activity_createdAt_id', 1],
    ];

    for (const [who, query, expectedIndex, tierIndex = 0] of cases) {
      const plan = await explainTier({ who, query, tierIndex });
      expect(plan.stages).not.toContain('SORT');
      expect(plan.indexes).toContain(expectedIndex);
    }
  });
});
