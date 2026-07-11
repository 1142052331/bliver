const mongoose = require('mongoose');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const FootprintRead = require('../models/FootprintRead');
const AppError = require('../middleware/AppError');
const { getFriendIds } = require('./SuperuserPolicy');
const { canReadFootprint, id } = require('../policies/FootprintVisibilityPolicy');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isFootprintUnread({
  footprint,
  viewerId,
  baselineAt,
  readAt,
  now = new Date(),
}) {
  const effectiveReadAt = new Date(readAt || baselineAt || now);
  const latestCommentAt = (footprint.comments || []).reduce((latest, comment) => {
    const value = new Date(comment.createdAt || 0);
    return value > latest ? value : latest;
  }, new Date(0));

  if (latestCommentAt > effectiveReadAt) return true;
  if (id(footprint.userId) === id(viewerId)) return false;

  const createdAt = new Date(footprint.createdAt);
  return createdAt > effectiveReadAt && now - createdAt < SEVEN_DAYS_MS;
}

async function ensureReadBaseline(userId, now = new Date()) {
  const initialized = await User.findOneAndUpdate(
    { _id: userId, footprintReadBaselineAt: null },
    { $set: { footprintReadBaselineAt: now } },
    { returnDocument: 'after' },
  ).select('footprintReadBaselineAt').lean();
  if (initialized) return initialized.footprintReadBaselineAt;

  const existing = await User.findById(userId).select('footprintReadBaselineAt').lean();
  if (!existing) throw new AppError(404, 'User not found');
  return existing.footprintReadBaselineAt || now;
}

async function getUnreadByFootprintId({ viewerId, footprints, now = new Date() }) {
  const result = new Map();
  if (!viewerId || footprints.length === 0) return result;

  const baselineAt = await ensureReadBaseline(viewerId, now);
  const footprintIds = [...new Set(footprints.map((footprint) => id(footprint)).filter(Boolean))];
  const readStates = await FootprintRead.find({
    userId: viewerId,
    footprintId: { $in: footprintIds },
  }).lean();
  const readAtById = new Map(readStates.map((state) => [id(state.footprintId), state.readAt]));

  for (const footprint of footprints) {
    const footprintId = id(footprint);
    result.set(footprintId, isFootprintUnread({
      footprint,
      viewerId,
      baselineAt,
      readAt: readAtById.get(footprintId),
      now,
    }));
  }
  return result;
}

async function getReadableFootprint({ viewer, footprintId, now }) {
  if (!mongoose.Types.ObjectId.isValid(footprintId)) return null;
  const footprint = await Footprint.findById(footprintId);
  if (!footprint) return null;
  const friendIds = await getFriendIds(viewer.id);
  return canReadFootprint({
    footprint,
    viewerId: viewer.id,
    friendIds,
    isAdmin: viewer.role === 'admin',
    now,
  }) ? footprint : null;
}

async function markRead({ viewer, footprintId, now = new Date() }) {
  const footprint = await getReadableFootprint({ viewer, footprintId, now });
  if (!footprint) throw new AppError(404, 'Footprint not found');
  await ensureReadBaseline(viewer.id, now);
  await FootprintRead.findOneAndUpdate(
    { userId: viewer.id, footprintId: footprint._id },
    { $max: { readAt: now } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  return { readAt: now };
}

async function importLegacy({ viewer, entries, now = new Date() }) {
  if (!Array.isArray(entries) || entries.length > 500) {
    throw new AppError(400, 'Read-state import accepts at most 500 entries');
  }
  await ensureReadBaseline(viewer.id, now);

  const normalized = new Map();
  for (const entry of entries) {
    if (!mongoose.Types.ObjectId.isValid(entry?.footprintId)) continue;
    const value = new Date(entry.readAt);
    if (Number.isNaN(value.getTime())) continue;
    const readAt = value > now ? now : value;
    const previous = normalized.get(entry.footprintId);
    if (!previous || readAt > previous) normalized.set(entry.footprintId, readAt);
  }

  const footprints = await Footprint.find({ _id: { $in: [...normalized.keys()] } });
  const friendIds = await getFriendIds(viewer.id);
  const operations = [];
  for (const footprint of footprints) {
    if (!canReadFootprint({
      footprint,
      viewerId: viewer.id,
      friendIds,
      isAdmin: viewer.role === 'admin',
      now,
    })) continue;
    operations.push({
      updateOne: {
        filter: { userId: viewer.id, footprintId: footprint._id },
        update: { $max: { readAt: normalized.get(footprint.id) } },
        upsert: true,
      },
    });
  }
  if (operations.length > 0) await FootprintRead.bulkWrite(operations);
  return { imported: operations.length, skipped: entries.length - operations.length };
}

module.exports = {
  ensureReadBaseline,
  getUnreadByFootprintId,
  importLegacy,
  isFootprintUnread,
  markRead,
};
