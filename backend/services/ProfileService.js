const mongoose = require('mongoose');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { sanitizeLocation } = require('./location');
const { populateFootprint } = require('./footprint');
const { notify } = require('./notification');
const bus = require('../events/bus');
const AppError = require('../middleware/AppError');
const {
  authorizationFilter,
  filterReadableFootprints,
  getViewerAccess,
} = require('./FootprintAccessService');

const PROFILE_BATCH_SIZE = 50;

function beforeCursor(cursor) {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ],
  };
}

async function collectReadable({ filter, access, isAdmin, limit, now, populate }) {
  const result = [];
  let cursor = null;

  while (result.length < limit) {
    const cursorFilter = beforeCursor(cursor);
    const filters = [filter, authorizationFilter({ ...access, now })];
    if (cursor) filters.push(cursorFilter);
    const effectiveFilter = { $and: filters };
    const query = Footprint.findSafe(effectiveFilter, { isAdmin })
      .sort({ createdAt: -1, _id: -1 })
      .limit(PROFILE_BATCH_SIZE);
    const docs = await populate(query);
    const readable = await filterReadableFootprints({ access, footprints: docs, now });
    result.push(...readable.slice(0, limit - result.length));

    if (docs.length < PROFILE_BATCH_SIZE) break;
    cursor = docs[docs.length - 1];
  }

  return result;
}

function aggregationAccess(access) {
  const toObjectId = (value) => new mongoose.Types.ObjectId(value.toString());
  return {
    ...access,
    viewerId: access.viewerId ? toObjectId(access.viewerId) : null,
    friendIds: new Set([...access.friendIds].map(toObjectId)),
  };
}

async function collectRecentComments({ user, access, isAdmin, now }) {
  const matchingComment = {
    $or: [
      { $eq: ['$$comment.userId', user._id] },
      { $eq: ['$$comment.username', user.name] },
    ],
  };
  const rows = await Footprint.aggregate()
    .match({
      $and: [
        {
          $or: [
            { 'comments.userId': user._id },
            { 'comments.username': user.name },
          ],
        },
        authorizationFilter({ ...aggregationAccess(access), now }),
      ],
    })
    .addFields({
      _profileLatestCommentAt: {
        $max: {
          $map: {
            input: { $filter: { input: '$comments', as: 'comment', cond: matchingComment } },
            as: 'comment',
            in: '$$comment.createdAt',
          },
        },
      },
    })
    .sort({ _profileLatestCommentAt: -1, _id: -1 })
    .limit(5);

  if (rows.length === 0) return [];
  const docs = await Footprint.findSafe({ _id: { $in: rows.map((row) => row._id) } }, { isAdmin })
    .populate('userId', 'name avatarUrl');
  const readable = await filterReadableFootprints({ access, footprints: docs, now });
  const byId = new Map(readable.map((doc) => [doc.id, doc]));
  return rows.map((row) => byId.get(row._id.toString())).filter(Boolean);
}

class ProfileService {
  // ── Get profile page data (visit tracking + footprints + reactions + comments) ──

  async getProfile(userId, viewer) {
    const user = await User.findById(userId)
      .select('-password')
      .populate('profileReactions.senderId', 'name avatarUrl')
      .populate('profileVisitors.visitorId', 'name avatarUrl');

    if (!user) return null;

    // Record visit when another logged-in user views this profile
    if (viewer && viewer.id !== userId) {
      await this._recordVisit(userId, viewer);
    }

    const isAdmin = viewer?.role === 'admin';
    const access = await getViewerAccess(viewer);
    const now = new Date();
    const readableFootprints = await collectReadable({
      filter: { userId }, access, isAdmin, limit: 30, now, populate: populateFootprint,
    });
    const footprints = readableFootprints
      .map((fp) => sanitizeLocation(fp.toObject(), isAdmin));

    const populateAuthor = (query) => query.populate('userId', 'name avatarUrl');
    const reactionDocs = await collectReadable({
      filter: { 'reactions.userId': userId }, access, isAdmin, limit: 5, now, populate: populateAuthor,
    });
    const commentDocs = await collectRecentComments({ user, access, isAdmin, now });
    const recentReactions = reactionDocs.map((fp) => sanitizeLocation(fp.toObject(), isAdmin));
    const recentComments = commentDocs.map((fp) => sanitizeLocation(fp.toObject(), isAdmin));

    return { user, footprints, recentReactions, recentComments };
  }

  // ── Add comment to someone's profile ──

  async addComment(targetUserId, senderName, content) {
    if (!content) throw new AppError(400, 'content is required');
    if (content.length > 500) throw new AppError(400, '留言不能超过500字');

    const user = await User.findById(targetUserId);
    if (!user) throw new AppError(404, 'User not found');

    user.profileComments.push({ senderName, content });
    await user.save();

    const updated = await User.findById(targetUserId).select('-password')
      .populate('profileReactions.senderId', 'name avatarUrl');

    bus.emit('profile:updated', { userId: targetUserId, user: updated });

    return { user: updated };
  }

  // ── Toggle reaction emoji on profile ──

  async toggleReaction(targetUserId, senderId, emoji) {
    if (!emoji) throw new AppError(400, 'emoji is required');

    const before = await User.findOneAndUpdate(
      { _id: targetUserId },
      { $pull: { profileReactions: { senderId } } },
      { new: false }
    );

    if (!before) throw new AppError(404, 'User not found');

    const oldReaction = before.profileReactions.find(r => r.senderId?.toString() === senderId);
    const isToggleOff = oldReaction && oldReaction.emoji === emoji;

    if (!isToggleOff) {
      await User.findByIdAndUpdate(targetUserId, {
        $push: { profileReactions: { senderId, emoji } },
      });
    }

    const updated = await User.findById(targetUserId).select('-password')
      .populate('profileReactions.senderId', 'name avatarUrl');

    bus.emit('profile:updated', { userId: targetUserId, user: updated });

    return { user: updated, isToggleOff };
  }

  // ── Update current user's banner image ──

  async updateBanner(userId, cloudinaryUrl) {
    if (!cloudinaryUrl) throw new AppError(400, 'No banner image uploaded');

    const user = await User.findByIdAndUpdate(
      userId,
      { profileBannerUrl: cloudinaryUrl },
      { returnDocument: 'after' }
    ).select('-password');

    bus.emit('profile:updated', { userId, user });

    return { user };
  }

  // ── Update current user's name / avatar ──

  async updateProfile(userId, { name, cloudinaryUrl }) {
    const updates = {};

    if (name && name.trim()) {
      const trimmed = name.trim();
      const exists = await User.findOne({ name: trimmed, _id: { $ne: userId } });
      if (exists) throw new AppError(400, 'Name already taken');
      updates.name = trimmed;
    }

    if (cloudinaryUrl) {
      updates.avatarUrl = cloudinaryUrl;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError(400, 'Nothing to update');
    }

    const user = await User.findByIdAndUpdate(userId, updates, { returnDocument: 'after' }).select('-password');

    bus.emit('profile:updated', { userId, user });

    return { user };
  }

  // ── Private ──

  async _recordVisit(targetUserId, viewer) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existed = await User.findOneAndUpdate(
      { _id: targetUserId, 'profileVisitors.visitorId': viewer.id, 'profileVisitors.visitedAt': { $gte: today } },
      { $set: { 'profileVisitors.$.visitedAt': new Date() } }
    );

    if (!existed) {
      await User.findByIdAndUpdate(targetUserId, {
        $push: { profileVisitors: { $each: [{ visitorId: viewer.id, visitedAt: new Date() }], $slice: -30 } },
      });

      await notify({
        recipientId: targetUserId,
        senderId: viewer.id,
        senderName: viewer.name,
        type: 'profile_view',
        footprintId: null,
        content: '浏览了你的主页',
      });
    }
  }
}

module.exports = new ProfileService();
