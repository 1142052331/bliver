const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const FootprintModel = require('../models/Footprint');
const { reverseGeocodeStructured: defaultReverseGeocode } = require('./nominatim');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 1000;
const MAX_DELAY_MS = 60 * 1000;
const REQUIRED_TEXT_FIELDS = ['placeName', 'countryCode', 'countryName', 'regionCode', 'regionName'];
const VALID_VISIBILITIES = new Set(['public', 'friends', 'private']);
const VALID_PRECISIONS = new Set(['approximate', 'precise']);
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function retryableFailedBranch() {
  return {
    $and: [
      { 'regionBackfill.status': 'failed' },
      {
        $or: [
          { 'regionBackfill.attempts': { $lt: MAX_ATTEMPTS } },
          { 'regionBackfill.attempts': { $exists: false } },
          { 'regionBackfill.attempts': null },
        ],
      },
    ],
  };
}

function validateBackfillOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const {
    limit = 100,
    cursor = null,
    delayMs = 0,
    dryRun = false,
    retryFailed = false,
  } = options;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (cursor !== null && cursor !== undefined
    && (typeof cursor !== 'string' || !mongoose.isObjectIdOrHexString(cursor))) {
    throw new TypeError('cursor must be a valid ObjectId string');
  }
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) {
    throw new RangeError(`delayMs must be an integer between 0 and ${MAX_DELAY_MS}`);
  }
  if (typeof dryRun !== 'boolean') throw new TypeError('dryRun must be a boolean');
  if (typeof retryFailed !== 'boolean') throw new TypeError('retryFailed must be a boolean');

  return {
    limit,
    cursor: cursor || null,
    delayMs,
    dryRun,
    retryFailed,
  };
}

function buildEligibilityQuery({ cursor, retryFailed, now = new Date(), dryRun = false }) {
  const statusBranches = [
    { 'regionBackfill.status': 'pending' },
    {
      'regionBackfill.status': 'processing',
      'regionBackfill.leaseExpiresAt': { $lte: now },
    },
  ];
  if (retryFailed) {
    statusBranches.push(retryableFailedBranch());
  }
  if (dryRun) {
    statusBranches.push(
      { 'regionBackfill.status': { $exists: false } },
      { 'regionBackfill.status': null },
    );
  }
  const eligible = { $or: statusBranches };

  return cursor
    ? { $and: [{ _id: { $gt: new mongoose.Types.ObjectId(cursor) } }, eligible] }
    : eligible;
}

function buildClaimFilter(id, { retryFailed, now }) {
  const statuses = [
    { 'regionBackfill.status': 'pending' },
    {
      'regionBackfill.status': 'processing',
      'regionBackfill.leaseExpiresAt': { $lte: now },
    },
  ];
  if (retryFailed) {
    statuses.push(retryableFailedBranch());
  }
  return { _id: id, $or: statuses };
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function needsBackfill(doc, retryFailed) {
  const status = doc.regionBackfill?.claimedFromStatus || doc.regionBackfill?.status;
  if (status === 'complete') return false;
  if (status === 'failed' && doc.regionBackfill?.status === 'processing') return true;
  if (status === 'failed' && !retryFailed) return false;
  if (retryFailed && (status === 'failed' || status === 'pending')) return true;
  if (!VALID_VISIBILITIES.has(doc.visibility)) return true;
  return REQUIRED_TEXT_FIELDS.some((field) => !hasText(doc[field]));
}

function classifyGeography(value) {
  if (!value || value.failureCode) return { error: 'reverse_geocode_failed' };
  if (!REQUIRED_TEXT_FIELDS.every((field) => hasText(
    field === 'placeName' ? value.displayName : value[field]
  ))) {
    return { error: 'incomplete_geography' };
  }
  return {
    geography: {
      placeName: value.displayName.trim(),
      countryCode: value.countryCode.trim(),
      countryName: value.countryName.trim(),
      regionCode: value.regionCode.trim(),
      regionName: value.regionName.trim(),
    },
  };
}

async function materializeLegacyCandidates({ Footprint, cursor = null, limit }) {
  const legacyFilter = {
    $and: [
      cursor ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } : {},
      {
        $or: [
          { 'regionBackfill.status': { $exists: false } },
          { 'regionBackfill.status': null },
        ],
      },
    ],
  };
  const fetched = await Footprint.find(legacyFilter)
    .select('_id')
    .sort({ _id: 1 })
    .limit(limit + 1)
    .hint({ _id: 1 })
    .lean()
    .exec();
  const ids = fetched.slice(0, limit).map((doc) => doc._id);
  if (ids.length === 0) return { materialized: 0, hasMoreLegacy: false };

  const write = await Footprint.updateMany(
    {
      _id: { $in: ids },
      $or: [
        { 'regionBackfill.status': { $exists: false } },
        { 'regionBackfill.status': null },
      ],
    },
    {
      $set: {
        'regionBackfill.status': 'pending',
        'regionBackfill.attempts': 0,
        'regionBackfill.error': '',
        'regionBackfill.runToken': '',
        'regionBackfill.leaseExpiresAt': null,
      },
    },
  );
  return {
    materialized: write.modifiedCount,
    hasMoreLegacy: fetched.length > limit,
  };
}

function createFootprintBackfillService({
  Footprint = FootprintModel,
  reverseGeocodeStructured = defaultReverseGeocode,
  clock = () => new Date(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  runTokenFactory = randomUUID,
  leaseMs = DEFAULT_LEASE_MS,
} = {}) {
  if (!Footprint || typeof Footprint.find !== 'function') throw new TypeError('Footprint model is required');
  if (typeof reverseGeocodeStructured !== 'function') throw new TypeError('geocoder must be a function');
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function');
  if (typeof runTokenFactory !== 'function') throw new TypeError('runTokenFactory must be a function');
  if (!Number.isInteger(leaseMs) || leaseMs < 1) throw new RangeError('leaseMs must be a positive integer');

  async function inspect(id) {
    return Footprint.findById(id)
      .select('_id location realLocation visibility locationPrecision placeName countryCode countryName regionCode regionName regionBackfill')
      .lean()
      .exec();
  }

  async function claim(id, options, attemptedAt, runToken) {
    return Footprint.findOneAndUpdate(
      buildClaimFilter(id, { retryFailed: options.retryFailed, now: attemptedAt }),
      [{
        $set: {
          'regionBackfill.claimedFromStatus': {
            $cond: [
              { $eq: ['$regionBackfill.status', 'processing'] },
              {
                $cond: [
                  { $in: ['$regionBackfill.claimedFromStatus', ['pending', 'failed']] },
                  '$regionBackfill.claimedFromStatus',
                  'pending',
                ],
              },
              '$regionBackfill.status',
            ],
          },
          'regionBackfill.status': 'processing',
          'regionBackfill.runToken': runToken,
          'regionBackfill.leaseExpiresAt': new Date(attemptedAt.getTime() + leaseMs),
          'regionBackfill.error': '',
        },
      }],
      { returnDocument: 'after', updatePipeline: true },
    ).select('_id location realLocation visibility locationPrecision placeName countryCode countryName regionCode regionName regionBackfill')
      .lean()
      .exec();
  }

  function sameValue(filter, path, value) {
    if (value === undefined) filter[path] = { $exists: false };
    else if (value === null) filter[path] = { $eq: null, $exists: true };
    else filter[path] = value;
  }

  function completionFilter(doc, runToken) {
    const filter = {
      _id: doc._id,
      'regionBackfill.status': 'processing',
      'regionBackfill.runToken': runToken,
      'location.lat': doc.location?.lat,
      'location.lng': doc.location?.lng,
    };
    sameValue(filter, 'visibility', doc.visibility);
    sameValue(filter, 'locationPrecision', doc.locationPrecision);
    for (const field of REQUIRED_TEXT_FIELDS) sameValue(filter, field, doc[field]);
    sameValue(filter, 'realLocation', doc.realLocation);
    sameValue(filter, 'regionBackfill.attempts', doc.regionBackfill?.attempts);
    return filter;
  }

  async function refreshOwnedSnapshot(doc, runToken, refreshedAt) {
    return Footprint.findOneAndUpdate(
      completionFilter(doc, runToken),
      {
        $set: {
          'regionBackfill.leaseExpiresAt': new Date(refreshedAt.getTime() + leaseMs),
        },
      },
      { returnDocument: 'after' },
    ).select('_id location realLocation visibility locationPrecision placeName countryCode countryName regionCode regionName regionBackfill')
      .lean()
      .exec();
  }

  async function releaseConflict(doc, runToken, totals) {
    await Footprint.updateOne(
      {
        _id: doc._id,
        'regionBackfill.status': 'processing',
        'regionBackfill.runToken': runToken,
      },
      {
        $set: {
          'regionBackfill.status': 'pending',
          'regionBackfill.leaseExpiresAt': null,
          'regionBackfill.error': 'state_conflict',
        },
      },
    ).catch(() => {});
    totals.skipped += 1;
    totals.conflicted += 1;
  }

  async function markOwnedValidationFailure(doc, runToken, error, totals) {
    try {
      const write = await Footprint.updateOne(
        completionFilter(doc, runToken),
        {
          $set: {
            'regionBackfill.status': 'failed',
            'regionBackfill.leaseExpiresAt': null,
            'regionBackfill.error': error,
          },
        },
      );
      if (write.acknowledged && write.matchedCount === 1) {
        totals.failed += 1;
        return;
      }
    } catch {
      const current = await inspect(doc._id).catch(() => null);
      if (current?.regionBackfill?.runToken === runToken
        && current.regionBackfill.status === 'failed'
        && current.regionBackfill.attempts === doc.regionBackfill?.attempts) {
        totals.failed += 1;
        return;
      }
    }
    await releaseConflict(doc, runToken, totals);
  }

  async function recordAttemptConflict(doc, runToken, attemptedAt, totals) {
    const expectedAttempts = (doc.regionBackfill?.attempts || 0) + 1;
    const filter = {
      _id: doc._id,
      'regionBackfill.status': 'processing',
      'regionBackfill.runToken': runToken,
    };
    sameValue(filter, 'regionBackfill.attempts', doc.regionBackfill?.attempts);
    try {
      const write = await Footprint.updateOne(
        filter,
        {
          $set: {
            'regionBackfill.status': 'pending',
            'regionBackfill.leaseExpiresAt': null,
            'regionBackfill.lastAttemptAt': attemptedAt,
            'regionBackfill.error': 'state_conflict',
          },
          $inc: { 'regionBackfill.attempts': 1 },
        },
      );
      if (write.acknowledged && write.matchedCount === 1) {
        totals.skipped += 1;
        totals.conflicted += 1;
        return;
      }
    } catch {
      const current = await inspect(doc._id).catch(() => null);
      if (current?.regionBackfill?.runToken === runToken
        && current.regionBackfill.status === 'pending'
        && current.regionBackfill.attempts === expectedAttempts) {
        totals.skipped += 1;
        totals.conflicted += 1;
        return;
      }
    }
    totals.skipped += 1;
    totals.conflicted += 1;
  }

  async function markOwnedFailure(doc, runToken, attemptedAt, error, totals) {
    const expectedAttempts = (doc.regionBackfill?.attempts || 0) + 1;
    const deadLettered = expectedAttempts >= MAX_ATTEMPTS;
    const failureStatus = deadLettered ? 'dead' : 'failed';
    const filter = {
      _id: doc._id,
      'regionBackfill.status': 'processing',
      'regionBackfill.runToken': runToken,
    };
    sameValue(filter, 'regionBackfill.attempts', doc.regionBackfill?.attempts);
    try {
      const write = await Footprint.updateOne(
        filter,
        {
          $set: {
            'regionBackfill.status': failureStatus,
            'regionBackfill.leaseExpiresAt': null,
            'regionBackfill.lastAttemptAt': attemptedAt,
            'regionBackfill.error': error,
          },
          $inc: { 'regionBackfill.attempts': 1 },
        },
      );
      if (write.acknowledged && write.matchedCount === 1) {
        totals.failed += 1;
        if (deadLettered) totals.deadLettered += 1;
        return;
      }
    } catch {
      // The server may have applied the write before the client saw the error.
    }

    const current = await inspect(doc._id).catch(() => null);
    if (current?.regionBackfill?.runToken === runToken
      && current.regionBackfill.status === failureStatus
      && current.regionBackfill.attempts === expectedAttempts) {
      totals.failed += 1;
      if (deadLettered) totals.deadLettered += 1;
      return;
    }
    if (current?.regionBackfill?.runToken === runToken
      && current.regionBackfill.status === 'processing'
      && current.regionBackfill.attempts === doc.regionBackfill?.attempts) {
      await recordAttemptConflict(doc, runToken, attemptedAt, totals);
      return;
    }
    totals.skipped += 1;
    totals.conflicted += 1;
  }

  async function completeOwned(doc, runToken, completedAt, geography, totals) {
    const expectedAttempts = (doc.regionBackfill?.attempts || 0) + 1;
    const visibility = VALID_VISIBILITIES.has(doc.visibility) ? doc.visibility : 'public';
    const locationPrecision = VALID_PRECISIONS.has(doc.locationPrecision)
      ? doc.locationPrecision
      : (doc.realLocation ? 'approximate' : 'precise');
    try {
      const write = await Footprint.updateOne(
        completionFilter(doc, runToken),
        {
          $set: {
            visibility,
            locationPrecision,
            ...geography,
            discoveryExpiresAt: visibility === 'public'
              ? new Date(completedAt.getTime() + DAY_MS)
              : null,
            'regionBackfill.status': 'complete',
            'regionBackfill.leaseExpiresAt': null,
            'regionBackfill.lastAttemptAt': completedAt,
            'regionBackfill.error': '',
          },
          $inc: { 'regionBackfill.attempts': 1 },
        },
      );
      if (write.acknowledged && write.matchedCount === 1) {
        totals.succeeded += 1;
        return;
      }
      await recordAttemptConflict(doc, runToken, completedAt, totals);
      return;
    } catch {
      const current = await inspect(doc._id).catch(() => null);
      if (current?.regionBackfill?.runToken === runToken
        && current.regionBackfill.status === 'complete'
        && current.regionBackfill.attempts === expectedAttempts) {
        totals.succeeded += 1;
        return;
      }
      if (current?.regionBackfill?.runToken !== runToken
        || current?.regionBackfill?.status === 'complete') {
        totals.skipped += 1;
        totals.conflicted += 1;
        return;
      }
      await markOwnedFailure(doc, runToken, completedAt, 'database_write_failed', totals);
    }
  }

  async function completeStatusOnly(doc, runToken, totals) {
    try {
      const write = await Footprint.updateOne(
        completionFilter(doc, runToken),
        {
          $set: {
            'regionBackfill.status': 'complete',
            'regionBackfill.leaseExpiresAt': null,
            'regionBackfill.error': '',
          },
        },
      );
      if (write.acknowledged && write.matchedCount === 1) {
        totals.skipped += 1;
        return;
      }
      await releaseConflict(doc, runToken, totals);
      return;
    } catch {
      const current = await inspect(doc._id).catch(() => null);
      if (current?.regionBackfill?.runToken === runToken
        && current.regionBackfill.status === 'complete') {
        totals.skipped += 1;
        return;
      }
      if (current?.regionBackfill?.runToken !== runToken
        || current?.regionBackfill?.status === 'complete') {
        totals.skipped += 1;
        totals.conflicted += 1;
        return;
      }
      await releaseConflict(doc, runToken, totals);
    }
  }

  async function run(inputOptions = {}) {
    const options = validateBackfillOptions(inputOptions);
    const scanTime = new Date(clock());
    let hasMoreLegacy = false;
    if (!options.dryRun) {
      const materialized = await materializeLegacyCandidates({
        Footprint,
        cursor: options.cursor,
        limit: options.limit,
      });
      hasMoreLegacy = materialized.hasMoreLegacy;
    }
    const query = Footprint.find(buildEligibilityQuery({ ...options, now: scanTime }))
      .select('_id location realLocation visibility locationPrecision placeName countryCode countryName regionCode regionName regionBackfill')
      .sort({ _id: 1 })
      .limit(options.limit + 1)
      .lean();
    const fetched = await query.exec();
    const hasMore = hasMoreLegacy || fetched.length > options.limit;
    const docs = fetched.slice(0, options.limit);
    const totals = {
      mode: options.dryRun ? 'dry-run' : 'execute',
      cursorScope: options.dryRun
        ? 'dry-run-advisory-start-execute-at-null'
        : 'execute-resume',
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      conflicted: 0,
      wouldSucceed: 0,
      wouldFail: 0,
      wouldSkip: 0,
      deadLettered: 0,
      nextCursor: null,
      hasMore,
    };
    let geocodeCalls = 0;
    const runToken = String(runTokenFactory());

    for (const candidate of docs) {
      totals.processed += 1;
      totals.nextCursor = candidate._id.toString();
      let doc = candidate;
      if (!options.dryRun) {
        try {
          doc = await claim(candidate._id, options, new Date(clock()), runToken);
        } catch {
          const current = await inspect(candidate._id).catch(() => null);
          doc = current?.regionBackfill?.status === 'processing'
            && current.regionBackfill.runToken === runToken
            ? current
            : null;
        }
      }
      if (!doc) {
        totals.skipped += 1;
        totals.conflicted += 1;
        continue;
      }
      if (!needsBackfill(doc, options.retryFailed)) {
        if (options.dryRun) totals.wouldSkip += 1;
        else await completeStatusOnly(doc, runToken, totals);
        continue;
      }

      if (geocodeCalls > 0 && options.delayMs > 0) {
        try {
          await sleep(options.delayMs);
        } catch {
          if (!options.dryRun) await releaseConflict(doc, runToken, totals);
          throw new Error('geocode_delay_failed');
        }
      }

      let attemptDoc = doc;
      if (!options.dryRun) {
        try {
          attemptDoc = await refreshOwnedSnapshot(doc, runToken, new Date(clock()));
        } catch {
          const current = await inspect(doc._id).catch(() => null);
          attemptDoc = current?.regionBackfill?.status === 'processing'
            && current.regionBackfill.runToken === runToken
            ? current
            : null;
        }
        if (!attemptDoc) {
          await releaseConflict(doc, runToken, totals);
          continue;
        }
      }
      const lat = Number(attemptDoc.location?.lat);
      const lng = Number(attemptDoc.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)
        || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        if (!options.dryRun) {
          await markOwnedValidationFailure(attemptDoc, runToken, 'INVALID_COORDINATES', totals);
        } else {
          totals.wouldFail += 1;
        }
        continue;
      }

      geocodeCalls += 1;
      let classified;
      try {
        classified = classifyGeography(await reverseGeocodeStructured(lat, lng));
      } catch {
        classified = { error: 'reverse_geocode_failed' };
      }

      if (classified.error) {
        if (!options.dryRun) {
          await markOwnedFailure(attemptDoc, runToken, new Date(clock()), classified.error, totals);
        } else {
          totals.wouldFail += 1;
        }
        continue;
      }

      if (options.dryRun) {
        totals.wouldSucceed += 1;
        continue;
      }

      await completeOwned(attemptDoc, runToken, new Date(clock()), classified.geography, totals);
    }

    return totals;
  }

  return { run };
}

module.exports = {
  createFootprintBackfillService,
  validateBackfillOptions,
  buildEligibilityQuery,
  materializeLegacyCandidates,
  MAX_ATTEMPTS,
};
