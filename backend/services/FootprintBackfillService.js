const mongoose = require('mongoose');
const FootprintModel = require('../models/Footprint');
const { reverseGeocodeStructured: defaultReverseGeocode } = require('./nominatim');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 1000;
const MAX_DELAY_MS = 60 * 1000;
const REQUIRED_TEXT_FIELDS = ['placeName', 'countryCode', 'countryName', 'regionCode', 'regionName'];
const VALID_VISIBILITIES = new Set(['public', 'friends', 'private']);
const VALID_PRECISIONS = new Set(['approximate', 'precise']);

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

function missingTextField(field) {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: { $regex: /^\s*$/ } },
    ],
  };
}

function buildEligibilityQuery({ cursor, retryFailed }) {
  const incomplete = {
    $or: [
      { visibility: { $exists: false } },
      { visibility: null },
      ...REQUIRED_TEXT_FIELDS.map(missingTextField),
    ],
  };
  const eligible = retryFailed
    ? {
      $and: [
        { 'regionBackfill.status': { $ne: 'complete' } },
        { $or: [incomplete, { 'regionBackfill.status': { $in: ['pending', 'failed'] } }] },
      ],
    }
    : { $and: [incomplete, { 'regionBackfill.status': { $nin: ['failed', 'complete'] } }] };

  return cursor
    ? { $and: [{ _id: { $gt: new mongoose.Types.ObjectId(cursor) } }, eligible] }
    : eligible;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function needsBackfill(doc, retryFailed) {
  const status = doc.regionBackfill?.status;
  if (status === 'complete') return false;
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

function createFootprintBackfillService({
  Footprint = FootprintModel,
  reverseGeocodeStructured = defaultReverseGeocode,
  clock = () => new Date(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!Footprint || typeof Footprint.find !== 'function') throw new TypeError('Footprint model is required');
  if (typeof reverseGeocodeStructured !== 'function') throw new TypeError('geocoder must be a function');
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function');

  async function markFailed(id, attemptedAt, error) {
    await Footprint.updateOne(
      { _id: id },
      {
        $set: {
          'regionBackfill.status': 'failed',
          'regionBackfill.lastAttemptAt': attemptedAt,
          'regionBackfill.error': error,
        },
        $inc: { 'regionBackfill.attempts': 1 },
      },
    );
  }

  async function run(inputOptions = {}) {
    const options = validateBackfillOptions(inputOptions);
    const query = Footprint.find(buildEligibilityQuery(options))
      .select('_id location realLocation visibility locationPrecision placeName countryCode countryName regionCode regionName regionBackfill')
      .sort({ _id: 1 })
      .limit(options.limit + 1)
      .hint({ _id: 1 })
      .lean();
    const fetched = await query.exec();
    const hasMore = fetched.length > options.limit;
    const docs = fetched.slice(0, options.limit);
    const totals = {
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      nextCursor: null,
      hasMore,
    };
    let geocodeCalls = 0;

    for (const doc of docs) {
      totals.processed += 1;
      totals.nextCursor = doc._id.toString();
      if (!needsBackfill(doc, options.retryFailed)) {
        totals.skipped += 1;
        continue;
      }

      const lat = Number(doc.location?.lat);
      const lng = Number(doc.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        totals.failed += 1;
        if (!options.dryRun) {
          const attemptedAt = new Date(clock());
          await markFailed(doc._id, attemptedAt, 'invalid_location').catch(() => {});
        }
        continue;
      }

      if (geocodeCalls > 0 && options.delayMs > 0) await sleep(options.delayMs);
      geocodeCalls += 1;
      let classified;
      try {
        classified = classifyGeography(await reverseGeocodeStructured(lat, lng));
      } catch {
        classified = { error: 'reverse_geocode_failed' };
      }

      if (classified.error) {
        totals.failed += 1;
        if (!options.dryRun) {
          const attemptedAt = new Date(clock());
          await markFailed(doc._id, attemptedAt, classified.error).catch(() => {});
        }
        continue;
      }

      if (options.dryRun) {
        totals.skipped += 1;
        continue;
      }

      const completedAt = new Date(clock());
      const visibility = VALID_VISIBILITIES.has(doc.visibility) ? doc.visibility : 'public';
      const locationPrecision = VALID_PRECISIONS.has(doc.locationPrecision)
        ? doc.locationPrecision
        : (doc.realLocation ? 'approximate' : 'precise');
      try {
        await Footprint.updateOne(
          { _id: doc._id },
          {
            $set: {
              visibility,
              locationPrecision,
              ...classified.geography,
              discoveryExpiresAt: visibility === 'public'
                ? new Date(completedAt.getTime() + DAY_MS)
                : null,
              'regionBackfill.status': 'complete',
              'regionBackfill.lastAttemptAt': completedAt,
              'regionBackfill.error': '',
            },
            $inc: { 'regionBackfill.attempts': 1 },
          },
        );
        totals.succeeded += 1;
      } catch {
        totals.failed += 1;
        await markFailed(doc._id, completedAt, 'database_write_failed').catch(() => {});
      }
    }

    return totals;
  }

  return { run };
}

module.exports = {
  createFootprintBackfillService,
  validateBackfillOptions,
  buildEligibilityQuery,
};
