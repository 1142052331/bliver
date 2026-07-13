const { parseArgs, runCli, PRODUCTION_CONFIRMATION } = require('../scripts/backfill-footprint-geography');
const mongoose = require('mongoose');
const Footprint = require('../models/Footprint');
const { connectDB, disconnectDB, clearDB } = require('./setup');

describe('release backfill CLI guards', () => {
  test('requires the exact execute confirmation token in every environment', () => {
    for (const env of [{ NODE_ENV: 'test' }, { NODE_ENV: 'development' }, { NODE_ENV: 'production' }]) {
      expect(() => parseArgs(['--execute'], env)).toThrow('confirm-execute');
      expect(parseArgs(['--execute', '--confirm-production', PRODUCTION_CONFIRMATION], env))
        .toMatchObject({ dryRun: false });
      expect(() => parseArgs(['--execute', '--confirm-production', 'wrong-token'], env))
        .toThrow('confirmation');
      expect(parseArgs(['--execute', '--confirm-execute', PRODUCTION_CONFIRMATION], env))
        .toMatchObject({ dryRun: false });
    }
  });

  test('default invocation remains dry-run and never invokes a write-capable option', async () => {
    const run = jest.fn().mockResolvedValue({ processed: 0 });
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(runCli([], {
      env: { NODE_ENV: 'production' },
      connectDB: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      createService: () => ({ run }),
      logger,
    })).resolves.toBe(0);

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(JSON.stringify(logger.mock?.calls || logger.log.mock.calls)).not.toMatch(/secret|mongodb:\/\//i);
  });

  test('builds a stable privacy-safe report from projected documents', async () => {
    const { buildReport } = require('../scripts/backfill-report');
    const docs = [
      {
        visibility: 'public',
        location: { lat: 31.234, lng: 121.499 },
        regionBackfill: { status: 'pending', attempts: 0 },
      },
      {
        visibility: 'private',
        location: { lat: 31.236, lng: 121.501 },
        regionBackfill: {
          status: 'processing',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
          runToken: 'secret-run-token',
        },
        message: 'private content must not be reported',
      },
      {
        visibility: 'friends',
        location: { lat: 31.2341, lng: 121.4991 },
        regionBackfill: { status: 'failed', attempts: 2, error: 'raw provider error' },
      },
      {
        visibility: 'public',
        location: { lat: 0, lng: 0 },
        regionBackfill: { status: 'dead', attempts: 5 },
      },
    ];
    const report = buildReport(docs, new Date('2026-01-01T00:00:00.000Z'));

    expect(report).toEqual({
      regionBackfill: { pending: 1, processing: 1, complete: 0, failed: 1, dead: 1, unknown: 0 },
      visibility: { public: 2, friends: 1, private: 1, unknown: 0 },
      staleProcessingLeases: 1,
      failed: 1,
      dead: 1,
      eligible: 2,
      uniqueCoordinatePairs: 3,
    });
    expect(JSON.stringify(report)).not.toMatch(/31\.234|secret|private content|raw provider|runToken/i);
  });

  test('counts only pending, unknown, and stale pending-origin processing as default eligible', () => {
    const { buildReport } = require('../scripts/backfill-report');
    const now = new Date('2026-01-01T00:00:00.000Z');
    const report = buildReport([
      { regionBackfill: { status: 'failed', attempts: 1 } },
      {
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 'pending',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      {
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 'failed',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      {
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 0,
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      { regionBackfill: { status: 'mystery' } },
    ], now);

    expect(report.eligible).toBe(2);
  });
});

describe('read-only backfill report aggregation', () => {
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

  test('returns only aggregate counts and leaves source documents unchanged', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Footprint.collection.insertMany([
      {
        userId,
        location: { lat: 31.234, lng: 121.499 },
        visibility: 'public',
        message: 'private report fixture',
        regionBackfill: { status: 'pending', attempts: 0 },
      },
      {
        userId,
        location: { lat: 31.2341, lng: 121.4991 },
        visibility: 'friends',
        regionBackfill: {
          status: 'processing',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
          runToken: 'private-run-token',
        },
      },
    ]);
    const before = await Footprint.collection.find({}).toArray();
    const { createBackfillReport } = require('../scripts/backfill-report');

    const report = await createBackfillReport({
      Footprint,
      now: new Date('2026-01-01T00:00:00.000Z'),
    }).run();

    expect(report).toEqual({
      regionBackfill: { pending: 1, processing: 1, complete: 0, failed: 0, dead: 0, unknown: 0 },
      visibility: { public: 1, friends: 1, private: 0, unknown: 0 },
      staleProcessingLeases: 1,
      failed: 0,
      dead: 0,
      eligible: 2,
      uniqueCoordinatePairs: 1,
    });
    expect(JSON.stringify(report)).not.toMatch(
      /31\.234|private report fixture|private-run-token|runToken|realLocation|"location"/i,
    );
    expect(await Footprint.collection.find({}).toArray()).toEqual(before);
  });

  test('keeps aggregation eligible counts aligned for retryable failed, stale pending, and stale failed-origin states', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Footprint.collection.insertMany([
      {
        userId,
        location: { lat: 10, lng: 20 },
        visibility: 'public',
        regionBackfill: { status: 'failed', attempts: 1 },
      },
      {
        userId,
        location: { lat: 11, lng: 21 },
        visibility: 'public',
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 'pending',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      {
        userId,
        location: { lat: 12, lng: 22 },
        visibility: 'public',
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 'failed',
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      {
        userId,
        location: { lat: 14, lng: 24 },
        visibility: 'public',
        regionBackfill: {
          status: 'processing',
          claimedFromStatus: 0,
          leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      {
        userId,
        location: { lat: 13, lng: 23 },
        visibility: 'public',
        regionBackfill: { status: 'mystery' },
      },
    ]);

    const { createBackfillReport } = require('../scripts/backfill-report');
    const report = await createBackfillReport({
      Footprint,
      now: new Date('2026-01-01T00:00:00.000Z'),
    }).run();

    expect(report.eligible).toBe(2);
  });
});
