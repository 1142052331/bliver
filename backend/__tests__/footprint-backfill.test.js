const mongoose = require('mongoose');
const { connectDB, disconnectDB, clearDB } = require('./setup');
const Footprint = require('../models/Footprint');
const {
  createFootprintBackfillService,
  validateBackfillOptions,
  materializeLegacyCandidates,
  MAX_ATTEMPTS,
  encodeBackfillCursor,
  decodeBackfillCursor,
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

  beforeAll(async () => {
    await connectDB();
    await Footprint.syncIndexes();
  });
  afterAll(disconnectDB);
  beforeEach(clearDB);
  afterEach(() => jest.restoreAllMocks());

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
      windowService: {
        acquire: jest.fn(async ({ token }) => ({
          token: token || 'test-window',
          createdAt: now,
          expiresAt: new Date(+now + 24 * 60 * 60 * 1000),
        })),
      },
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
      mode: 'execute',
      cursorScope: 'execute-resume',
      processed: 2,
      succeeded: 2,
      skipped: 0,
      failed: 0,
      conflicted: 0,
      wouldSucceed: 0,
      wouldFail: 0,
      wouldSkip: 0,
      deadLettered: 0,
      nextCursor: encodeBackfillCursor({
        mode: 'normal', id: friends._id.toString(), windowToken: 'test-window',
      }),
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
      discoveryOrigin: 'backfill',
      discoveryWindowToken: 'test-window',
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
    expect(saved.every((doc) => !doc.discoveryOrigin && doc.discoveryWindowToken === '')).toBe(true);
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
      mode: 'execute',
      cursorScope: 'execute-resume',
      processed: 2,
      succeeded: 1,
      skipped: 0,
      failed: 1,
      conflicted: 0,
      wouldSucceed: 0,
      wouldFail: 0,
      wouldSkip: 0,
      deadLettered: 0,
      nextCursor: encodeBackfillCursor({
        mode: 'normal', id: docs[1]._id.toString(), windowToken: 'test-window',
      }),
      hasMore: true,
    });

    const second = await service.run({ limit: 2, cursor: first.nextCursor });
    expect(second).toMatchObject({
      processed: 1,
      succeeded: 1,
      failed: 0,
      nextCursor: encodeBackfillCursor({
        mode: 'normal', id: docs[2]._id.toString(), windowToken: 'test-window',
      }),
      hasMore: false,
    });

    const normalRerun = await service.run({ limit: 10 });
    expect(normalRerun).toMatchObject({ processed: 0, succeeded: 0, failed: 0, hasMore: false });
    const retry = await service.run({ limit: 10, retryFailed: true });
    expect(retry).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
  });

  test('reuses the execute discovery window across resumed batches', async () => {
    const docs = [rawFootprint(), rawFootprint()]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(docs);
    const acquire = jest.fn(async ({ token }) => ({
      token: token || 'window-a',
      createdAt: now,
      expiresAt: new Date(+now + 24 * 60 * 60 * 1000),
    }));
    const service = serviceWith({ windowService: { acquire } });

    const first = await service.run({ limit: 1 });
    const second = await service.run({ limit: 1, cursor: first.nextCursor });

    expect(decodeBackfillCursor(first.nextCursor).windowToken).toBe('window-a');
    expect(acquire).toHaveBeenNthCalledWith(2, { token: 'window-a', now });
    expect(decodeBackfillCursor(second.nextCursor).windowToken).toBe('window-a');
    const saved = await Footprint.find({ _id: { $in: docs.map((doc) => doc._id) } }).lean();
    expect(saved.every((doc) => doc.discoveryWindowToken === 'window-a')).toBe(true);
    expect(saved.every((doc) => +doc.discoveryExpiresAt === +now + 24 * 60 * 60 * 1000)).toBe(true);
  });

  test('window acquisition failure happens before claims or completion', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const service = serviceWith({
      windowService: { acquire: jest.fn().mockRejectedValue(new Error('window unavailable')) },
    });

    await expect(service.run({ limit: 1 })).rejects.toThrow('window unavailable');
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      regionBackfill: { status: 'pending', attempts: 0 },
    });
  });

  test('dry run geocodes and advances the cursor but writes nothing or claims success', async () => {
    const legacy = rawFootprint();
    await Footprint.collection.insertOne(legacy);
    const service = serviceWith();

    const result = await service.run({ dryRun: true, limit: 1 });

    expect(result).toEqual({
      mode: 'dry-run',
      cursorScope: 'dry-run-advisory-start-execute-at-null',
      processed: 1,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      conflicted: 0,
      wouldSucceed: 1,
      wouldFail: 0,
      wouldSkip: 0,
      deadLettered: 0,
      nextCursor: encodeBackfillCursor({ mode: 'dry-normal', id: legacy._id.toString() }),
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

  test('allows only one worker to geocode and complete the same record', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    let releaseGeocoder;
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const gate = new Promise((resolve) => { releaseGeocoder = resolve; });
    let geocodeCalls = 0;
    const geocoder = jest.fn(async () => {
      geocodeCalls += 1;
      if (geocodeCalls === 1) {
        signalStarted();
        await gate;
      }
      return geography;
    });
    const workerA = serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'worker-a',
    });
    const workerB = serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'worker-b',
    });

    const firstRun = workerA.run({ limit: 10 });
    await started;
    const second = await workerB.run({ limit: 10 });
    releaseGeocoder();
    const first = await firstRun;

    expect(first).toMatchObject({ succeeded: 1 });
    expect(second).toMatchObject({ succeeded: 0 });
    expect(geocoder).toHaveBeenCalledTimes(1);
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      countryCode: geography.countryCode,
      regionBackfill: { status: 'complete', runToken: 'worker-a' },
    });
  });

  test('claims with the post-claim current document', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const claimSpy = jest.spyOn(Footprint, 'findOneAndUpdate');

    await serviceWith({ runTokenFactory: () => 'post-claim-worker' }).run({ limit: 10 });

    expect(claimSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.anything(),
      expect.objectContaining({ returnDocument: 'after' }),
    );
  });

  test('continues from owned state after an ambiguous claim result', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const originalFindOneAndUpdate = Footprint.findOneAndUpdate.bind(Footprint);
    jest.spyOn(Footprint, 'findOneAndUpdate').mockImplementation((...args) => {
      const query = originalFindOneAndUpdate(...args);
      const originalExec = query.exec.bind(query);
      query.exec = async () => {
        await originalExec();
        throw new Error('claim result unknown');
      };
      return query;
    });

    const result = await serviceWith({
      runTokenFactory: () => 'ambiguous-claim-worker',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 1, failed: 0, conflicted: 0 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      regionBackfill: { status: 'complete', runToken: 'ambiguous-claim-worker' },
    });
  });

  test('requeues a claim when visibility or public coordinates change during geocoding', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      discoveryExpiresAt: null,
      regionBackfill: { status: 'pending', attempts: 0 },
    });
    await Footprint.collection.insertOne(pending);
    const geocoder = jest.fn(async () => {
      await Footprint.collection.updateOne(
        { _id: pending._id },
        { $set: { visibility: 'private', 'location.lat': 40 } },
      );
      return geography;
    });

    const result = await serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'privacy-worker',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 1 });
    const saved = await Footprint.collection.findOne({ _id: pending._id });
    expect(saved).toMatchObject({
      visibility: 'private',
      location: { lat: 40, lng: pending.location.lng },
      discoveryExpiresAt: null,
      regionBackfill: { status: 'pending' },
    });
    expect(saved).not.toHaveProperty('countryCode');
  });

  test('prevents an expired worker failure from overwriting a replacement completion', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const firstNow = new Date('2026-07-12T08:00:00.000Z');
    const secondNow = new Date('2026-07-12T08:00:02.000Z');
    let rejectFirst;
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const firstGeocode = new Promise((resolve, reject) => { rejectFirst = reject; });
    const staleWorker = createFootprintBackfillService({
      Footprint,
      reverseGeocodeStructured: jest.fn(() => {
        signalStarted();
        return firstGeocode;
      }),
      clock: () => firstNow,
      sleep: jest.fn(),
      leaseMs: 1000,
      runTokenFactory: () => 'stale-worker',
    });
    const replacement = createFootprintBackfillService({
      Footprint,
      reverseGeocodeStructured: jest.fn().mockResolvedValue(geography),
      clock: () => secondNow,
      sleep: jest.fn(),
      leaseMs: 1000,
      runTokenFactory: () => 'replacement-worker',
    });

    const staleRun = staleWorker.run({ limit: 10 });
    await started;
    const replacementResult = await replacement.run({ limit: 10 });
    rejectFirst(new Error('late failure'));
    const staleResult = await staleRun;

    expect(replacementResult).toMatchObject({ succeeded: 1 });
    expect(staleResult).toMatchObject({ failed: 0, succeeded: 0 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      countryCode: geography.countryCode,
      regionBackfill: { status: 'complete', runToken: 'replacement-worker' },
    });
  });

  test('reclaims expired failed-origin processing leases only in retry mode', async () => {
    const expired = rawFootprint({
      visibility: 'private',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: {
        status: 'processing',
        claimedFromStatus: 'failed',
        attempts: 2,
        runToken: 'crashed-worker',
        leaseExpiresAt: new Date('2026-07-12T07:00:00.000Z'),
      },
    });
    await Footprint.collection.insertOne(expired);
    const geocoder = jest.fn().mockResolvedValue(geography);

    const service = serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'reclaim-worker',
    });

    const normal = await service.run({ limit: 10 });
    expect(normal).toMatchObject({ processed: 0, succeeded: 0 });
    expect(geocoder).not.toHaveBeenCalled();

    const result = await service.run({ retryFailed: true, limit: 10, cursor: null });

    expect(result).toMatchObject({ processed: 1, succeeded: 1, skipped: 0 });
    expect(geocoder).toHaveBeenCalledTimes(1);
    expect(await Footprint.collection.findOne({ _id: expired._id })).toMatchObject({
      regionBackfill: { status: 'complete', claimedFromStatus: 'failed', attempts: 3 },
    });
  });

  test('status-only completion requeues when claimed visibility or location changes', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'pending', attempts: 3 },
    });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    let changed = false;
    jest.spyOn(Footprint, 'updateOne').mockImplementation(async (filter, update, options) => {
      if (!changed && update.$set?.['regionBackfill.status'] === 'complete') {
        changed = true;
        await Footprint.collection.updateOne(
          { _id: pending._id },
          { $set: { visibility: 'private', 'location.lat': 40 } },
        );
      }
      return originalUpdateOne(filter, update, options);
    });

    const result = await serviceWith({ runTokenFactory: () => 'status-conflict' }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 1 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      visibility: 'private',
      location: { lat: 40, lng: pending.location.lng },
      regionBackfill: { status: 'pending', attempts: 3 },
    });
  });

  test.each([
    ['placeName', ''],
    ['countryCode', null],
    ['countryName', 'Changed country'],
    ['regionCode', 'CHANGED-REGION'],
    ['regionName', 'Changed region'],
  ])('status-only completion requeues when %s changes after classification', async (field, changedValue) => {
    const pending = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'pending', attempts: 1 },
    });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    let changed = false;
    jest.spyOn(Footprint, 'updateOne').mockImplementation(async (filter, update, options) => {
      if (!changed && update.$set?.['regionBackfill.status'] === 'complete') {
        changed = true;
        await Footprint.collection.updateOne(
          { _id: pending._id },
          { $set: { [field]: changedValue } },
        );
      }
      return originalUpdateOne(filter, update, options);
    });

    const result = await serviceWith({ runTokenFactory: () => `structured-${field}` })
      .run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 1 });
    const saved = await Footprint.collection.findOne({ _id: pending._id });
    expect(saved[field]).toBe(changedValue);
    expect(saved.regionBackfill).toMatchObject({ status: 'pending', attempts: 1 });
  });

  test('status-only completion treats matchedCount zero as an ownership conflict', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'pending', attempts: 0 },
    });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    jest.spyOn(Footprint, 'updateOne').mockImplementation((filter, update, options) => {
      if (update.$set?.['regionBackfill.status'] === 'complete') {
        return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
      }
      return originalUpdateOne(filter, update, options);
    });

    const result = await serviceWith({ runTokenFactory: () => 'status-no-match' }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 1 });
    expect((await Footprint.collection.findOne({ _id: pending._id })).regionBackfill.status)
      .toBe('pending');
  });

  test('status-only completion recognizes an applied write after a client error', async () => {
    const pending = rawFootprint({
      visibility: 'friends',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'pending', attempts: 2 },
    });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    jest.spyOn(Footprint, 'updateOne').mockImplementation(async (filter, update, options) => {
      const result = await originalUpdateOne(filter, update, options);
      if (update.$set?.['regionBackfill.status'] === 'complete') {
        throw new Error('status completion result unknown');
      }
      return result;
    });

    const result = await serviceWith({ runTokenFactory: () => 'status-ambiguous' }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 0 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      visibility: 'friends',
      regionBackfill: { status: 'complete', attempts: 2 },
    });
  });

  test('charges only real geocode attempts before dead-lettering the fifth failure', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      placeName: geography.displayName,
      countryCode: geography.countryCode,
      countryName: geography.countryName,
      regionCode: geography.regionCode,
      regionName: geography.regionName,
      regionBackfill: { status: 'pending', attempts: 3 },
    });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    jest.spyOn(Footprint, 'updateOne').mockImplementation((filter, update, options) => {
      if (update.$set?.['regionBackfill.status'] === 'complete') {
        return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
      }
      return originalUpdateOne(filter, update, options);
    });
    const service = serviceWith({
      reverseGeocodeStructured: jest.fn().mockResolvedValue({
        ...geography,
        failureCode: 'reverse_geocode_failed',
      }),
    });

    await service.run({ limit: 10 });
    Footprint.updateOne.mockRestore();
    await Footprint.collection.updateOne(
      { _id: pending._id },
      { $set: { placeName: '', 'regionBackfill.status': 'pending' } },
    );
    const fourth = await service.run({ limit: 10 });
    const afterFourth = await Footprint.collection.findOne({ _id: pending._id });
    const fifth = await service.run({ retryFailed: true, limit: 10, cursor: null });

    expect(fourth).toMatchObject({ failed: 1, deadLettered: 0 });
    expect(afterFourth.regionBackfill).toMatchObject({ status: 'failed', attempts: 4 });
    expect(fifth).toMatchObject({ failed: 1, deadLettered: 1 });
    expect((await Footprint.collection.findOne({ _id: pending._id })).regionBackfill)
      .toMatchObject({ status: 'dead', attempts: 5 });
  });

  test('dead-letters the fifth consumed attempt when completion CAS conflicts', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      regionBackfill: { status: 'pending', attempts: MAX_ATTEMPTS - 1 },
    });
    await Footprint.collection.insertOne(pending);
    const geocoder = jest.fn(async () => {
      await Footprint.collection.updateOne(
        { _id: pending._id },
        { $set: { visibility: 'private' } },
      );
      return geography;
    });

    const result = await serviceWith({ reverseGeocodeStructured: geocoder }).run({ limit: 10 });

    expect(result).toMatchObject({
      succeeded: 0,
      skipped: 1,
      conflicted: 1,
      deadLettered: 1,
    });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      visibility: 'private',
      regionBackfill: { status: 'dead', attempts: MAX_ATTEMPTS },
    });
  });

  test('restores failed provenance after a lower-budget geocoder CAS conflict', async () => {
    const failedOrigin = rawFootprint({
      visibility: 'public',
      regionBackfill: {
        status: 'processing',
        claimedFromStatus: 'failed',
        attempts: 2,
        runToken: 'expired-failed',
        leaseExpiresAt: new Date('2026-07-12T07:00:00.000Z'),
      },
    });
    await Footprint.collection.insertOne(failedOrigin);
    const geocoder = jest.fn(async () => {
      await Footprint.collection.updateOne(
        { _id: failedOrigin._id },
        { $set: { 'location.lat': 40 } },
      );
      return geography;
    });
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const retry = await service.run({ retryFailed: true, limit: 10, cursor: null });
    const normal = await service.run({ limit: 10, cursor: null });

    expect(retry).toMatchObject({ skipped: 1, conflicted: 1, deadLettered: 0 });
    expect(normal).toMatchObject({ processed: 0 });
    expect(geocoder).toHaveBeenCalledTimes(1);
    expect(await Footprint.collection.findOne({ _id: failedOrigin._id })).toMatchObject({
      location: { lat: 40, lng: failedOrigin.location.lng },
      regionBackfill: { status: 'failed', attempts: 3 },
    });
  });

  test('restores failed provenance after a pre-geocoder refresh conflict', async () => {
    const failed = rawFootprint({
      regionBackfill: { status: 'failed', attempts: 2, error: 'reverse_geocode_failed' },
    });
    await Footprint.collection.insertOne(failed);
    const originalFindOneAndUpdate = Footprint.findOneAndUpdate.bind(Footprint);
    let calls = 0;
    jest.spyOn(Footprint, 'findOneAndUpdate').mockImplementation((...args) => {
      const query = originalFindOneAndUpdate(...args);
      calls += 1;
      if (calls === 2) {
        const originalExec = query.exec.bind(query);
        query.exec = async () => {
          await Footprint.collection.updateOne(
            { _id: failed._id },
            { $set: { 'location.lng': 116 } },
          );
          return originalExec();
        };
      }
      return query;
    });
    const geocoder = jest.fn();

    const result = await serviceWith({ reverseGeocodeStructured: geocoder })
      .run({ retryFailed: true, limit: 10, cursor: null });

    expect(result).toMatchObject({ skipped: 1, conflicted: 1 });
    expect(geocoder).not.toHaveBeenCalled();
    expect(await Footprint.collection.findOne({ _id: failed._id })).toMatchObject({
      location: { lat: failed.location.lat, lng: 116 },
      regionBackfill: { status: 'failed', attempts: 2 },
    });
  });

  test('uses authoritative coordinates after an ambiguous begin-attempt result', async () => {
    const pending = rawFootprint({
      visibility: 'public',
      locationPrecision: 'precise',
      regionBackfill: { status: 'pending', attempts: 0 },
    });
    await Footprint.collection.insertOne(pending);
    const beijing = {
      displayName: 'Beijing, China',
      countryCode: 'CN',
      countryName: 'China',
      regionCode: 'CN-BJ',
      regionName: 'Beijing',
    };
    const geocoder = jest.fn(async (lat) => (lat === 40 ? beijing : geography));
    const originalFindOneAndUpdate = Footprint.findOneAndUpdate.bind(Footprint);
    let updateCalls = 0;
    jest.spyOn(Footprint, 'findOneAndUpdate').mockImplementation((...args) => {
      const query = originalFindOneAndUpdate(...args);
      updateCalls += 1;
      if (updateCalls === 2) {
        const originalExec = query.exec.bind(query);
        query.exec = async () => {
          await originalExec();
          await Footprint.collection.updateOne(
            { _id: pending._id },
            {
              $set: {
                visibility: 'private',
                location: { lat: 40, lng: 116 },
              },
            },
          );
          throw new Error('attempt result unknown');
        };
      }
      return query;
    });

    const result = await serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'authoritative-attempt',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 1, failed: 0, conflicted: 0 });
    expect(geocoder).toHaveBeenCalledWith(40, 116);
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      visibility: 'private',
      location: { lat: 40, lng: 116 },
      placeName: beijing.displayName,
      regionCode: beijing.regionCode,
      discoveryExpiresAt: null,
      regionBackfill: { status: 'complete', attempts: 1 },
    });
  });

  test('distinguishes a null structured snapshot from a concurrently removed field', async () => {
    const pending = rawFootprint({
      countryCode: null,
      regionBackfill: { status: 'pending', attempts: 0 },
    });
    await Footprint.collection.insertOne(pending);
    const geocoder = jest.fn(async () => {
      await Footprint.collection.updateOne(
        { _id: pending._id },
        { $unset: { countryCode: '' } },
      );
      return geography;
    });

    const result = await serviceWith({
      reverseGeocodeStructured: geocoder,
      runTokenFactory: () => 'null-snapshot-worker',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, skipped: 1, conflicted: 1 });
    const saved = await Footprint.collection.findOne({ _id: pending._id });
    expect(saved).not.toHaveProperty('countryCode');
    expect(saved.regionBackfill).toMatchObject({ status: 'pending', attempts: 1 });
  });

  test('inspects ownership after an ambiguous completion write error', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    jest.spyOn(Footprint, 'updateOne').mockImplementation(async (filter, update, options) => {
      const result = await originalUpdateOne(filter, update, options);
      if (update.$set?.['regionBackfill.status'] === 'complete') {
        throw new Error('network result unknown');
      }
      return result;
    });

    const result = await serviceWith({
      runTokenFactory: () => 'ambiguous-worker',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      regionBackfill: { status: 'complete', runToken: 'ambiguous-worker', attempts: 1 },
    });
  });

  test('inspects ownership after an ambiguous failure write error', async () => {
    const pending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertOne(pending);
    const originalUpdateOne = Footprint.updateOne.bind(Footprint);
    jest.spyOn(Footprint, 'updateOne').mockImplementation(async (filter, update, options) => {
      const result = await originalUpdateOne(filter, update, options);
      if (update.$set?.['regionBackfill.status'] === 'failed') {
        throw new Error('network result unknown');
      }
      return result;
    });

    const result = await serviceWith({
      reverseGeocodeStructured: jest.fn().mockRejectedValue(new Error('provider down')),
      runTokenFactory: () => 'ambiguous-failure-worker',
    }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(await Footprint.collection.findOne({ _id: pending._id })).toMatchObject({
      regionBackfill: { status: 'failed', runToken: 'ambiguous-failure-worker', attempts: 1 },
    });
  });

  test('retries legacy failed markers whose attempt counter is missing', async () => {
    const failed = rawFootprint({
      regionBackfill: { status: 'failed', error: 'reverse_geocode_failed' },
    });
    await Footprint.collection.insertOne(failed);

    const result = await serviceWith().run({ retryFailed: true, limit: 10, cursor: null });

    expect(result).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
  });

  test('reports dry-run failures separately and rejects out-of-range coordinates before geocoding', async () => {
    const invalid = rawFootprint({
      location: { lat: 91, lng: -181 },
      regionBackfill: { status: 'pending', attempts: 0 },
    });
    await Footprint.collection.insertOne(invalid);
    const geocoder = jest.fn();

    const result = await serviceWith({ reverseGeocodeStructured: geocoder })
      .run({ dryRun: true, limit: 10 });

    expect(result).toMatchObject({
      mode: 'dry-run',
      failed: 0,
      skipped: 0,
      wouldSucceed: 0,
      wouldFail: 1,
      wouldSkip: 0,
    });
    expect(geocoder).not.toHaveBeenCalled();
    expect((await Footprint.collection.findOne({ _id: invalid._id })).regionBackfill.status)
      .toBe('pending');
  });

  test('dead-letters structurally invalid coordinates without consuming attempts', async () => {
    const invalid = [
      rawFootprint({
        location: { lat: null, lng: 121.47 },
        regionBackfill: { status: 'pending', attempts: 0 },
      }),
      rawFootprint({
        location: { lat: 91, lng: 121.47 },
        regionBackfill: { status: 'pending', attempts: MAX_ATTEMPTS - 1 },
      }),
    ];
    await Footprint.collection.insertMany(invalid);
    const geocoder = jest.fn();
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const first = await service.run({ limit: 10 });
    const second = await service.run({ retryFailed: true, limit: 10, cursor: null });

    expect(first).toMatchObject({ failed: 2, deadLettered: 2 });
    expect(second).toMatchObject({ processed: 0, failed: 0 });
    expect(geocoder).not.toHaveBeenCalled();
    const saved = await Footprint.collection.find({ _id: { $in: invalid.map((doc) => doc._id) } })
      .sort({ _id: 1 }).toArray();
    expect(saved.map((doc) => doc.regionBackfill.attempts).sort()).toEqual([0, MAX_ATTEMPTS - 1]);
    for (const doc of saved) {
      expect(doc.regionBackfill).toMatchObject({
        status: 'dead',
        error: 'INVALID_COORDINATES',
        lastAttemptAt: now,
      });
    }
  });

  test('increments attempts exactly once for each resolved success or provider failure', async () => {
    const success = rawFootprint({ regionBackfill: { status: 'pending', attempts: 2 } });
    const failure = rawFootprint({ regionBackfill: { status: 'pending', attempts: 2 } });
    const docs = [success, failure].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(docs);
    const geocoder = jest.fn()
      .mockResolvedValueOnce(geography)
      .mockResolvedValueOnce({ ...geography, failureCode: 'reverse_geocode_failed' });

    const result = await serviceWith({ reverseGeocodeStructured: geocoder }).run({ limit: 10 });

    expect(result).toMatchObject({ succeeded: 1, failed: 1 });
    const stored = await Footprint.collection.find({ _id: { $in: docs.map((doc) => doc._id) } })
      .sort({ _id: 1 }).toArray();
    expect(stored[0].regionBackfill).toMatchObject({ status: 'complete', attempts: 3 });
    expect(stored[1].regionBackfill).toMatchObject({ status: 'failed', attempts: 3 });
    expect(geocoder).toHaveBeenCalledTimes(2);
  });

  test('requeues without charging an attempt when inter-call delay fails', async () => {
    const docs = [rawFootprint(), rawFootprint()]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(docs);
    const sleep = jest.fn().mockRejectedValue(new Error('secret throttle failure'));
    const service = serviceWith({ sleep });

    await expect(service.run({ limit: 10, delayMs: 25 })).rejects.toThrow('geocode_delay_failed');

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(await Footprint.collection.findOne({ _id: docs[0]._id })).toMatchObject({
      regionBackfill: { status: 'complete', attempts: 1 },
    });
    expect(await Footprint.collection.findOne({ _id: docs[1]._id })).toMatchObject({
      regionBackfill: { status: 'pending', attempts: 0 },
    });
  });

  test('advances retry sweeps across batches and dead-letters the final allowed failure', async () => {
    const failed = [rawFootprint(), rawFootprint(), rawFootprint()]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()))
      .map((doc) => ({
        ...doc,
        regionBackfill: { status: 'failed', attempts: MAX_ATTEMPTS - 1, error: 'reverse_geocode_failed' },
      }));
    await Footprint.collection.insertMany(failed);
    const geocoder = jest.fn().mockResolvedValue({ ...geography, failureCode: 'reverse_geocode_failed' });
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const first = await service.run({ retryFailed: true, limit: 2, cursor: null });
    const second = await service.run({ retryFailed: true, limit: 2, cursor: first.nextCursor });
    const nextSweep = await service.run({ retryFailed: true, limit: 2, cursor: null });

    expect(first).toMatchObject({ processed: 2, failed: 2, deadLettered: 2, hasMore: true });
    expect(second).toMatchObject({ processed: 1, failed: 1, deadLettered: 1, hasMore: false });
    expect(nextSweep).toMatchObject({ processed: 0, failed: 0, deadLettered: 0 });
    expect(await Footprint.collection.countDocuments({ 'regionBackfill.status': 'dead' })).toBe(3);
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

  test('encodes opaque versioned cursors and rejects sweep-mode mismatches', () => {
    const id = new mongoose.Types.ObjectId().toString();
    const normal = encodeBackfillCursor({ mode: 'normal', id });
    const retry = encodeBackfillCursor({ mode: 'retry', id });
    const dryNormal = encodeBackfillCursor({ mode: 'dry-normal', id });
    const dryRetry = encodeBackfillCursor({ mode: 'dry-retry', id });

    expect(normal).not.toContain(id);
    expect(decodeBackfillCursor(normal)).toEqual({ version: 1, mode: 'normal', id });
    expect(() => validateBackfillOptions({ cursor: normal })).not.toThrow();
    expect(() => validateBackfillOptions({ cursor: retry, retryFailed: true })).not.toThrow();
    expect(() => validateBackfillOptions({ cursor: dryNormal, dryRun: true })).not.toThrow();
    expect(() => validateBackfillOptions({
      cursor: dryRetry,
      dryRun: true,
      retryFailed: true,
    })).not.toThrow();
    expect(() => validateBackfillOptions({ cursor: normal, retryFailed: true }))
      .toThrow('cursor mode');
    expect(() => validateBackfillOptions({ cursor: retry })).toThrow('cursor mode');
    expect(() => validateBackfillOptions({ cursor: dryNormal, dryRun: true, retryFailed: true }))
      .toThrow('cursor mode');
    expect(() => validateBackfillOptions({ cursor: dryRetry, dryRun: true }))
      .toThrow('cursor mode');

    const windowed = encodeBackfillCursor({ mode: 'normal', id, windowToken: 'opaque-window' });
    expect(windowed).not.toContain('opaque-window');
    expect(decodeBackfillCursor(windowed)).toEqual({
      version: 1, mode: 'normal', id, windowToken: 'opaque-window',
    });
    expect(() => encodeBackfillCursor({
      mode: 'dry-normal', id, windowToken: 'opaque-window',
    })).toThrow('window token');
  });

  test('rejects dry-normal cursor reuse that would skip a lower failed record', async () => {
    const failed = rawFootprint({
      regionBackfill: { status: 'failed', attempts: 1, error: 'reverse_geocode_failed' },
    });
    const higherPending = rawFootprint({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertMany([failed, higherPending]);
    const geocoder = jest.fn().mockResolvedValue(geography);
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const normalDry = await service.run({ dryRun: true, limit: 1 });
    expect(decodeBackfillCursor(normalDry.nextCursor)).toMatchObject({
      mode: 'dry-normal',
      id: higherPending._id.toString(),
    });
    await expect(service.run({
      dryRun: true,
      retryFailed: true,
      limit: 1,
      cursor: normalDry.nextCursor,
    })).rejects.toThrow('cursor mode');

    const retryDry = await service.run({ dryRun: true, retryFailed: true, limit: 1, cursor: null });
    expect(decodeBackfillCursor(retryDry.nextCursor)).toMatchObject({
      mode: 'dry-retry',
      id: failed._id.toString(),
    });
    expect(geocoder).toHaveBeenCalledTimes(2);
  });

  test('rejects a terminal normal cursor when starting a retry sweep', async () => {
    const docs = [rawFootprint(), rawFootprint()]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(docs);
    const geocoder = jest.fn()
      .mockResolvedValueOnce({ ...geography, failureCode: 'reverse_geocode_failed' })
      .mockResolvedValueOnce(geography);
    const service = serviceWith({ reverseGeocodeStructured: geocoder });

    const normal = await service.run({ limit: 2 });
    expect(decodeBackfillCursor(normal.nextCursor)).toMatchObject({
      mode: 'normal',
      id: docs[1]._id.toString(),
    });
    await expect(service.run({
      retryFailed: true,
      limit: 2,
      cursor: normal.nextCursor,
    })).rejects.toThrow('cursor mode');
    expect(geocoder).toHaveBeenCalledTimes(2);
  });
});

describe('footprint geography backfill CLI', () => {
  const cursor = encodeBackfillCursor({
    mode: 'dry-retry',
    id: new mongoose.Types.ObjectId().toString(),
  });
  const productionToken = 'BACKFILL_FOOTPRINT_GEOGRAPHY';

  test('defaults an invocation with no flags to dry-run', () => {
    const { parseArgs } = require('../scripts/backfill-footprint-geography');

    expect(parseArgs([])).toMatchObject({ dryRun: true });
  });

  test('requires explicit execute mode and additional production confirmation', () => {
    const { parseArgs } = require('../scripts/backfill-footprint-geography');

    expect(parseArgs(['--execute'], { NODE_ENV: 'test' })).toMatchObject({ dryRun: false });
    expect(() => parseArgs(['--dry-run', '--execute'], { NODE_ENV: 'test' }))
      .toThrow('mutually exclusive');
    expect(() => parseArgs(['--execute'], { NODE_ENV: 'production' }))
      .toThrow('confirm-production');
    expect(parseArgs([
      '--execute', '--confirm-production', productionToken,
    ], { NODE_ENV: 'production' })).toMatchObject({ dryRun: false });
    expect(() => parseArgs([
      '--execute', '--confirm-production', 'wrong-token',
    ], { NODE_ENV: 'production' })).toThrow('confirmation token');
  });

  test('CLI parser rejects dry cursor retry-mode mismatches in both directions', () => {
    const { parseArgs } = require('../scripts/backfill-footprint-geography');
    const id = new mongoose.Types.ObjectId().toString();
    const dryNormal = encodeBackfillCursor({ mode: 'dry-normal', id });
    const dryRetry = encodeBackfillCursor({ mode: 'dry-retry', id });

    expect(() => parseArgs(['--dry-run', '--cursor', dryNormal])).not.toThrow();
    expect(() => parseArgs(['--dry-run', '--retry-failed', '--cursor', dryRetry])).not.toThrow();
    expect(() => parseArgs(['--dry-run', '--retry-failed', '--cursor', dryNormal]))
      .toThrow('cursor mode');
    expect(() => parseArgs(['--dry-run', '--cursor', dryRetry])).toThrow('cursor mode');
  });

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
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({ mode: 'dry-run', ...totals }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('returns setup failures through finally and safely reports disconnect failure', async () => {
    const { runCli } = require('../scripts/backfill-footprint-geography');
    const connectDB = jest.fn().mockRejectedValue(new Error('mongodb://user:secret@host'));
    const disconnect = jest.fn().mockRejectedValue(new Error('secret disconnect details'));
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(runCli([], { connectDB, disconnect, logger })).resolves.toBe(1);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Footprint geography backfill failed');
    expect(logger.error).toHaveBeenCalledWith('Database disconnect failed');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
  });

  test('returns nonzero when disconnect fails after a successful dry-run', async () => {
    const { runCli } = require('../scripts/backfill-footprint-geography');
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(runCli([], {
      connectDB: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockRejectedValue(new Error('secret cleanup detail')),
      logger,
      createService: () => ({
        run: jest.fn().mockResolvedValue({ processed: 0, succeeded: 0 }),
      }),
    })).resolves.toBe(1);

    expect(logger.error).toHaveBeenCalledWith('Database disconnect failed');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
  });
});

describe('throw-based database connector', () => {
  test('rejects after bounded retries instead of exiting the process', async () => {
    const { connectDBOrThrow } = require('../config/db');
    const connect = jest.fn().mockRejectedValue(new Error('unavailable'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(connectDBOrThrow({
      connect,
      sleep,
      maxRetries: 2,
      retryDelayMs: 5,
    })).rejects.toThrow('unavailable');

    expect(connect).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
});

describe('footprint backfill materialized eligibility', () => {
  let disconnectWarning;
  beforeAll(async () => {
    disconnectWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await connectDB();
  });
  afterAll(async () => {
    await disconnectDB();
    disconnectWarning.mockRestore();
  });
  beforeEach(clearDB);
  afterEach(() => {
    jest.restoreAllMocks();
    disconnectWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  test('schema stores lease ownership and exposes status-driven indexes', () => {
    const statusPath = Footprint.schema.path('regionBackfill.status');
    const runTokenPath = Footprint.schema.path('regionBackfill.runToken');
    const leasePath = Footprint.schema.path('regionBackfill.leaseExpiresAt');
    const indexes = Footprint.schema.indexes();

    expect(statusPath.enumValues).toContain('dead');
    expect(runTokenPath.instance).toBe('String');
    expect(leasePath.instance).toBe('Date');
    expect(indexes).toEqual(expect.arrayContaining([
      expect.arrayContaining([
        { 'regionBackfill.status': 1, _id: 1 },
        expect.objectContaining({ name: 'region_backfill_status_id' }),
      ]),
      expect.arrayContaining([
        { 'regionBackfill.status': 1, 'regionBackfill.leaseExpiresAt': 1, _id: 1 },
        expect.objectContaining({ name: 'region_backfill_status_lease_id' }),
      ]),
    ]));
  });

  test('CLI with no arguments connects for a zero-write dry-run', async () => {
    const { runCli } = require('../scripts/backfill-footprint-geography');
    const legacy = rawLegacy();
    await Footprint.collection.insertOne(legacy);
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);

    await expect(runCli([], {
      connectDB,
      disconnect,
      logger,
      createService: () => createFootprintBackfillService({
        Footprint,
        reverseGeocodeStructured: jest.fn().mockResolvedValue({
          displayName: 'Shanghai, China',
          countryCode: 'CN',
          countryName: 'China',
          regionCode: 'CN-SH',
          regionName: 'Shanghai',
        }),
      }),
    })).resolves.toBe(0);

    expect(connectDB).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logger.log.mock.calls[0][0])).toMatchObject({
      mode: 'dry-run',
      succeeded: 0,
      wouldSucceed: 1,
    });
    expect(await Footprint.collection.findOne({ _id: legacy._id })).not.toHaveProperty('regionBackfill');
  });

  test('materializes only a bounded id-ordered page of status-less legacy rows', async () => {
    const legacy = [rawLegacy(), rawLegacy(), rawLegacy()]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    await Footprint.collection.insertMany(legacy);
    await Footprint.syncIndexes();
    const originalFind = Footprint.find.bind(Footprint);
    let usedHint;
    const findSpy = jest.spyOn(Footprint, 'find').mockImplementation((...args) => {
      const query = originalFind(...args);
      const originalHint = query.hint.bind(query);
      query.hint = (hint) => {
        usedHint = hint;
        return originalHint(hint);
      };
      return query;
    });

    const result = await materializeLegacyCandidates({
      Footprint,
      cursor: null,
      limit: 2,
    });

    expect(result).toEqual({ materialized: 2, hasMoreLegacy: true });
    expect(findSpy).toHaveBeenCalledWith({ 'regionBackfill.status': null });
    expect(usedHint).toBe('region_backfill_status_id');
    const stored = await Footprint.collection.find({}).sort({ _id: 1 }).toArray();
    expect(stored.slice(0, 2).every((doc) => doc.regionBackfill.status === 'pending')).toBe(true);
    expect(stored[2]).not.toHaveProperty('regionBackfill.status');
  });

  test('status candidate selection uses the bounded status/id index on mostly complete data', async () => {
    const complete = Array.from({ length: 300 }, () => rawLegacy({
      regionBackfill: { status: 'complete', attempts: 1 },
    }));
    const pending = rawLegacy({ regionBackfill: { status: 'pending', attempts: 0 } });
    await Footprint.collection.insertMany([...complete, pending]);
    await Footprint.syncIndexes();

    const explanation = await Footprint.collection.find({
      'regionBackfill.status': 'pending',
    }).sort({ _id: 1 }).hint('region_backfill_status_id').explain('executionStats');

    expect(explanation.executionStats.nReturned).toBe(1);
    expect(explanation.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
    expect(JSON.stringify(explanation.queryPlanner.winningPlan)).toContain('IXSCAN');
  });

  test('legacy materialization examines only bounded null-status index entries', async () => {
    const complete = Array.from({ length: 300 }, () => rawLegacy({
      regionBackfill: { status: 'complete', attempts: 1 },
    }));
    const legacy = [rawLegacy(), rawLegacy()];
    await Footprint.collection.insertMany([...complete, ...legacy]);
    await Footprint.syncIndexes();

    const explanation = await Footprint.collection.find({
      'regionBackfill.status': null,
    }).sort({ _id: 1 }).limit(3).hint('region_backfill_status_id').explain('executionStats');

    expect(explanation.executionStats.nReturned).toBe(2);
    expect(explanation.executionStats.totalDocsExamined).toBeLessThanOrEqual(3);
    expect(explanation.executionStats.totalKeysExamined).toBeLessThanOrEqual(3);
    expect(JSON.stringify(explanation.queryPlanner.winningPlan)).toContain('IXSCAN');
  });

  function rawLegacy(overrides = {}) {
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
});
