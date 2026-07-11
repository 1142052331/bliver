const mongoose = require('mongoose');
const { connectDB, disconnectDB, clearDB } = require('./setup');
const Footprint = require('../models/Footprint');
const {
  createFootprintBackfillService,
  validateBackfillOptions,
} = require('../services/FootprintBackfillService');

describe('FootprintBackfillService', () => {
  const now = new Date('2026-07-12T08:00:00.000Z');
  const geography = {
    displayName: 'Shanghai, China',
    countryCode: 'CN',
    countryName: 'China',
    regionCode: 'CN-SH',
    regionName: 'Shanghai',
  };

  beforeAll(connectDB);
  afterAll(disconnectDB);
  beforeEach(clearDB);

  function rawFootprint(overrides = {}) {
    return {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      location: { lat: 31.23, lng: 121.47 },
      placeName: '',
      message: '',
      mood: '',
      photoUrl: '',
      reactions: [],
      comments: [],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function serviceWith(overrides = {}) {
    return createFootprintBackfillService({
      Footprint,
      reverseGeocodeStructured: jest.fn().mockResolvedValue(geography),
      clock: () => now,
      sleep: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });
  }

  test('backfills legacy geography from public coordinates without weakening explicit privacy', async () => {
    const legacy = rawFootprint({
      realLocation: { lat: 30.01, lng: 120.01 },
    });
    const friends = rawFootprint({
      visibility: 'friends',
      locationPrecision: 'precise',
    });
    const completedExpiry = new Date('2025-01-03T00:00:00.000Z');
    const completed = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      discoveryExpiresAt: completedExpiry,
      regionBackfill: { status: 'complete', attempts: 1, lastAttemptAt: now, error: '' },
    });
    await Footprint.collection.insertMany([legacy, friends, completed]);
    const geocoder = jest.fn().mockResolvedValue(geography);

    const result = await serviceWith({ reverseGeocodeStructured: geocoder }).run({ limit: 10 });

    expect(result).toEqual({
      processed: 2,
      succeeded: 2,
      skipped: 0,
      failed: 0,
      nextCursor: friends._id.toString(),
      hasMore: false,
    });
    expect(geocoder).toHaveBeenNthCalledWith(1, legacy.location.lat, legacy.location.lng);
    expect(geocoder).toHaveBeenNthCalledWith(2, friends.location.lat, friends.location.lng);
    expect(geocoder).not.toHaveBeenCalledWith(legacy.realLocation.lat, legacy.realLocation.lng);

    const [savedLegacy, savedFriends, savedCompleted] = await Promise.all([
      Footprint.collection.findOne({ _id: legacy._id }),
      Footprint.collection.findOne({ _id: friends._id }),
      Footprint.collection.findOne({ _id: completed._id }),
    ]);
    expect(savedLegacy).toMatchObject({
      visibility: 'public',
      locationPrecision: 'approximate',
      placeName: geography.displayName,
      countryCode: 'CN',
      countryName: 'China',
      regionCode: 'CN-SH',
      regionName: 'Shanghai',
      regionBackfill: { status: 'complete', attempts: 1, lastAttemptAt: now, error: '' },
    });
    expect(savedLegacy.discoveryExpiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    expect(savedFriends.visibility).toBe('friends');
    expect(savedFriends.locationPrecision).toBe('precise');
    expect(savedCompleted.discoveryExpiresAt).toEqual(completedExpiry);
  });

  test('never revisits complete records with partial metadata in normal or retry runs', async () => {
    const oldExpiry = new Date('2025-02-01T00:00:00.000Z');
    const complete = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: '',
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      discoveryExpiresAt: oldExpiry,
      regionBackfill: {
        status: 'complete',
        attempts: 7,
        lastAttemptAt: new Date('2025-01-01T00:00:00.000Z'),
        error: '',
      },
    });
    await Footprint.collection.insertOne(complete);
    const geocoder = jest.fn().mockResolvedValue(geography);
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    await expect(service.run({ limit: 10 })).resolves.toMatchObject({ processed: 0 });
    await expect(service.run({ limit: 10, retryFailed: true })).resolves.toMatchObject({ processed: 0 });

    const saved = await Footprint.collection.findOne({ _id: complete._id });
    expect(geocoder).not.toHaveBeenCalled();
    expect(saved.countryName).toBe('');
    expect(saved.discoveryExpiresAt).toEqual(oldExpiry);
    expect(saved.regionBackfill.attempts).toBe(7);
  });

  test('treats whitespace-only structured geography as missing database metadata', async () => {
    const whitespace = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: '   ',
      regionCode: geography.regionCode,
      regionName: '\t',
    });
    await Footprint.collection.insertOne(whitespace);
    const geocoder = jest.fn().mockResolvedValue(geography);

    const result = await serviceWith({ reverseGeocodeStructured: geocoder }).run({ limit: 10 });

    expect(result).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(geocoder).toHaveBeenCalledWith(whitespace.location.lat, whitespace.location.lng);
    expect(await Footprint.collection.findOne({ _id: whitespace._id })).toMatchObject({
      countryName: geography.countryName,
      regionName: geography.regionName,
    });
  });

  test('clears discovery expiry when backfilling explicit friends and private records', async () => {
    const strayExpiry = new Date('2025-04-01T00:00:00.000Z');
    const friends = rawFootprint({ visibility: 'friends', discoveryExpiresAt: strayExpiry });
    const privateFootprint = rawFootprint({ visibility: 'private', discoveryExpiresAt: strayExpiry });
    await Footprint.collection.insertMany([friends, privateFootprint]);

    const result = await serviceWith().run({ limit: 10 });

    expect(result).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
    const saved = await Footprint.collection.find({
      _id: { $in: [friends._id, privateFootprint._id] },
    }).sort({ _id: 1 }).toArray();
    expect(saved.map((doc) => doc.visibility).sort()).toEqual(['friends', 'private']);
    expect(saved.every((doc) => doc.discoveryExpiresAt === null)).toBe(true);
  });

  test('uses last scanned id for bounded resume even when a record fails', async () => {
    const docs = [rawFootprint(), rawFootprint(), rawFootprint()].sort((a, b) => (
      a._id.toString().localeCompare(b._id.toString())
    ));
    await Footprint.collection.insertMany(docs);
    const geocoder = jest.fn().mockResolvedValue(geography)
      .mockResolvedValueOnce(geography)
      .mockResolvedValueOnce({ ...geography, failureCode: 'reverse_geocode_failed' })
      .mockResolvedValueOnce(geography);
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const first = await service.run({ limit: 2 });
    expect(first).toEqual({
      processed: 2,
      succeeded: 1,
      skipped: 0,
      failed: 1,
      nextCursor: docs[1]._id.toString(),
      hasMore: true,
    });

    const second = await service.run({ limit: 2, cursor: first.nextCursor });
    expect(second).toMatchObject({
      processed: 1,
      succeeded: 1,
      failed: 0,
      nextCursor: docs[2]._id.toString(),
      hasMore: false,
    });

    const normalRerun = await service.run({ limit: 10 });
    expect(normalRerun).toMatchObject({ processed: 0, succeeded: 0, failed: 0, hasMore: false });
    const retry = await service.run({ limit: 10, retryFailed: true });
    expect(retry).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
  });

  test('dry run geocodes and advances the cursor but writes nothing or claims success', async () => {
    const legacy = rawFootprint();
    await Footprint.collection.insertOne(legacy);
    const service = serviceWith();

    const result = await service.run({ dryRun: true, limit: 1 });

    expect(result).toEqual({
      processed: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
      nextCursor: legacy._id.toString(),
      hasMore: false,
    });
    expect(await Footprint.collection.findOne({ _id: legacy._id })).not.toHaveProperty('visibility');
  });

  test('records bounded stable failures, increments attempts, and continues the batch', async () => {
    const failing = rawFootprint({
      regionBackfill: { status: 'pending', attempts: 2, error: '' },
    });
    const succeeding = rawFootprint();
    const docs = [failing, succeeding].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(docs);
    const geocoder = jest.fn()
      .mockRejectedValueOnce(new Error(`token=${'secret'.repeat(100)}`))
      .mockResolvedValueOnce(geography);

    const result = await serviceWith({ reverseGeocodeStructured: geocoder }).run({ limit: 10 });

    expect(result).toMatchObject({ processed: 2, succeeded: 1, failed: 1 });
    const failed = await Footprint.collection.findOne({ _id: docs[0]._id });
    expect(failed.regionBackfill).toMatchObject({
      status: 'failed',
      attempts: docs[0].regionBackfill?.attempts === 2 ? 3 : 1,
      lastAttemptAt: now,
      error: 'reverse_geocode_failed',
    });
    expect(failed.regionBackfill.error.length).toBeLessThanOrEqual(240);
    expect(failed.regionBackfill.error).not.toContain('secret');
  });

  test('delays only between geocode calls and never after the final call', async () => {
    const docs = [rawFootprint(), rawFootprint(), rawFootprint()];
    await Footprint.collection.insertMany(docs);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await serviceWith({ sleep }).run({ limit: 10, delayMs: 125 });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 125);
    expect(sleep).toHaveBeenNthCalledWith(2, 125);
  });

  test('retryFailed explicitly includes failed markers even when geography is populated', async () => {
    const failed = rawFootprint({
      visibility: 'private',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'failed', attempts: 1, lastAttemptAt: now, error: 'reverse_geocode_failed' },
    });
    await Footprint.collection.insertOne(failed);
    const service = serviceWith();

    await expect(service.run({ limit: 10 })).resolves.toMatchObject({ processed: 0 });
    await expect(service.run({ limit: 10, retryFailed: true })).resolves.toMatchObject({
      processed: 1,
      succeeded: 1,
    });
    expect((await Footprint.collection.findOne({ _id: failed._id })).visibility).toBe('private');
  });

  test.each([
    [{ limit: 0 }, 'limit'],
    [{ limit: 1.5 }, 'limit'],
    [{ limit: 1001 }, 'limit'],
    [{ delayMs: -1 }, 'delayMs'],
    [{ cursor: 'not-an-object-id' }, 'cursor'],
    [{ dryRun: 'yes' }, 'dryRun'],
    [{ retryFailed: 1 }, 'retryFailed'],
  ])('rejects invalid options before database work: %p', async (options, field) => {
    const find = jest.fn();
    const geocoder = jest.fn();
    const service = createFootprintBackfillService({
      Footprint: { find },
      reverseGeocodeStructured: geocoder,
    });

    expect(() => validateBackfillOptions(options)).toThrow(field);
    await expect(service.run(options)).rejects.toThrow(field);
    expect(find).not.toHaveBeenCalled();
    expect(geocoder).not.toHaveBeenCalled();
  });
});

describe('footprint geography backfill CLI', () => {
  const cursor = new mongoose.Types.ObjectId().toString();

  test('parses supported flags into validated service options', () => {
    const { parseArgs } = require('../scripts/backfill-footprint-geography');

    expect(parseArgs([
      '--dry-run',
      '--limit', '25',
      '--cursor', cursor,
      '--delay', '125',
      '--retry-failed',
    ])).toEqual({
      dryRun: true,
      limit: 25,
      cursor,
      delayMs: 125,
      retryFailed: true,
    });
  });

  test('rejects invalid CLI input before connecting', async () => {
    const { runCli } = require('../scripts/backfill-footprint-geography');
    const connectDB = jest.fn();
    const disconnect = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(runCli(['--limit', 'nope'], { connectDB, disconnect, logger })).resolves.toBe(1);
    expect(connectDB).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('limit'));
  });

  test('prints machine-readable totals and disconnects after a successful run', async () => {
    const { runCli } = require('../scripts/backfill-footprint-geography');
    const totals = {
      processed: 3,
      succeeded: 2,
      skipped: 0,
      failed: 1,
      nextCursor: cursor,
      hasMore: true,
    };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn().mockResolvedValue(totals);
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(runCli(['--dry-run'], {
      connectDB,
      disconnect,
      logger,
      createService: () => ({ run }),
    })).resolves.toBe(0);

    expect(run).toHaveBeenCalledWith({
      dryRun: true,
      limit: 100,
      cursor: null,
      delayMs: 0,
      retryFailed: false,
    });
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({ dryRun: true, ...totals }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
