#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const FootprintModel = require('../models/Footprint');
const { connectDBOrThrow } = require('../config/db');

const STATUS_KEYS = ['pending', 'processing', 'complete', 'failed', 'dead'];
const VISIBILITY_KEYS = ['public', 'friends', 'private'];

function countTemplate(keys) {
  return Object.fromEntries([...keys, 'unknown'].map((key) => [key, 0]));
}

function normalizeKey(value, keys) {
  return keys.includes(value) ? value : 'unknown';
}

function buildReport(documents, now = new Date()) {
  const regionBackfill = countTemplate(STATUS_KEYS);
  const visibility = countTemplate(VISIBILITY_KEYS);
  const coordinatePairs = new Set();
  let staleProcessingLeases = 0;
  let eligible = 0;

  for (const document of documents) {
    const status = normalizeKey(document.regionBackfill?.status, STATUS_KEYS);
    const visibilityKey = normalizeKey(document.visibility, VISIBILITY_KEYS);
    regionBackfill[status] += 1;
    visibility[visibilityKey] += 1;

    const lease = document.regionBackfill?.leaseExpiresAt;
    if (status === 'processing' && lease instanceof Date && lease.getTime() <= now.getTime()) {
      staleProcessingLeases += 1;
    }

    const claimedFromStatus = document.regionBackfill?.claimedFromStatus;
    const pendingOrigin = claimedFromStatus === undefined
      || claimedFromStatus === null
      || claimedFromStatus === ''
      || claimedFromStatus === 'pending';
    const eligibleStaleLease = status === 'processing'
      && lease instanceof Date
      && lease.getTime() <= now.getTime()
      && pendingOrigin;
    if (status === 'pending' || status === 'unknown' || eligibleStaleLease) {
      eligible += 1;
    }

    const lat = document.location?.lat;
    const lng = document.location?.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      coordinatePairs.add(`${lat.toFixed(2)}:${lng.toFixed(2)}`);
    }
  }

  return {
    regionBackfill,
    visibility,
    staleProcessingLeases,
    failed: regionBackfill.failed,
    dead: regionBackfill.dead,
    eligible,
    uniqueCoordinatePairs: coordinatePairs.size,
  };
}

function reportFromFacets(facets = {}) {
  const regionBackfill = countTemplate(STATUS_KEYS);
  const visibility = countTemplate(VISIBILITY_KEYS);
  for (const entry of facets.regionBackfill || []) {
    const key = normalizeKey(entry._id, STATUS_KEYS);
    regionBackfill[key] = entry.count;
  }
  for (const entry of facets.visibility || []) {
    const key = normalizeKey(entry._id, VISIBILITY_KEYS);
    visibility[key] = entry.count;
  }
  const count = (name) => facets[name]?.[0]?.count || 0;
  return {
    regionBackfill,
    visibility,
    staleProcessingLeases: count('staleProcessingLeases'),
    failed: regionBackfill.failed,
    dead: regionBackfill.dead,
    eligible: count('eligible'),
    uniqueCoordinatePairs: count('uniqueCoordinatePairs'),
  };
}

function createBackfillReport({
  Footprint = FootprintModel,
  now = new Date(),
} = {}) {
  async function run() {
    const [facets = {}] = await Footprint.aggregate([
      {
        $project: {
          regionBackfillStatus: {
            $cond: [
              { $in: ['$regionBackfill.status', STATUS_KEYS] },
              '$regionBackfill.status',
              'unknown',
            ],
          },
          visibility: {
            $cond: [
              { $in: ['$visibility', VISIBILITY_KEYS] },
              '$visibility',
              'unknown',
            ],
          },
          staleProcessingLease: {
            $and: [
              { $eq: ['$regionBackfill.status', 'processing'] },
              { $ne: ['$regionBackfill.leaseExpiresAt', null] },
              { $lte: ['$regionBackfill.leaseExpiresAt', now] },
            ],
          },
          eligible: {
            $or: [
              {
                $in: [
                  {
                    $cond: [
                      { $in: ['$regionBackfill.status', STATUS_KEYS] },
                      '$regionBackfill.status',
                      'unknown',
                    ],
                  },
                  ['pending', 'unknown'],
                ],
              },
              {
                $and: [
                  { $eq: ['$regionBackfill.status', 'processing'] },
                  { $ne: ['$regionBackfill.leaseExpiresAt', null] },
                  { $lte: ['$regionBackfill.leaseExpiresAt', now] },
                  {
                    $in: [
                      { $ifNull: ['$regionBackfill.claimedFromStatus', ''] },
                      ['', 'pending'],
                    ],
                  },
                ],
              },
            ],
          },
          coordinatePair: {
            $cond: [
              {
                $and: [
                  { $isNumber: '$location.lat' },
                  { $isNumber: '$location.lng' },
                  { $gte: ['$location.lat', -90] },
                  { $lte: ['$location.lat', 90] },
                  { $gte: ['$location.lng', -180] },
                  { $lte: ['$location.lng', 180] },
                ],
              },
              {
                lat: { $round: ['$location.lat', 2] },
                lng: { $round: ['$location.lng', 2] },
              },
              null,
            ],
          },
        },
      },
      {
        $facet: {
          regionBackfill: [{ $group: { _id: '$regionBackfillStatus', count: { $sum: 1 } } }],
          visibility: [{ $group: { _id: '$visibility', count: { $sum: 1 } } }],
          staleProcessingLeases: [
            { $match: { staleProcessingLease: true } },
            { $count: 'count' },
          ],
          eligible: [{ $match: { eligible: true } }, { $count: 'count' }],
          uniqueCoordinatePairs: [
            { $match: { coordinatePair: { $ne: null } } },
            { $group: { _id: '$coordinatePair' } },
            { $count: 'count' },
          ],
        },
      },
    ]).exec();
    return reportFromFacets(facets);
  }

  return { run };
}

async function runCli(dependencies = {}) {
  const logger = dependencies.logger || console;
  const connect = dependencies.connectDB || connectDBOrThrow;
  const disconnect = dependencies.disconnect || (() => mongoose.disconnect());
  const createReport = dependencies.createReport || createBackfillReport;
  let connectionAttempted = false;
  let exitCode = 0;

  try {
    connectionAttempted = true;
    await connect();
    const report = await createReport().run();
    logger.log(JSON.stringify(report));
  } catch (_error) {
    logger.error('Backfill report failed');
    exitCode = 1;
  } finally {
    if (connectionAttempted) {
      try {
        await disconnect();
      } catch (_error) {
        logger.error('Database disconnect failed');
        exitCode = 1;
      }
    }
  }

  return exitCode;
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { buildReport, reportFromFacets, createBackfillReport, runCli };
