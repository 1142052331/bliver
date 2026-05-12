const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { sanitizeLocation } = require('./location');
const { populateFootprint } = require('./footprint');
const { notify } = require('./notification');
const bus = require('../events/bus');

class ProfileService {
  // ── Get profile page data (visit tracking + footprints + reactions + comments) ──

  async getProfile(userId, viewer, isAdmin) {
    const user = await User.findById(userId)
      .select('-password')
      .populate('profileReactions.senderId', 'name avatarUrl')
      .populate('profileVisitors.visitorId', 'name avatarUrl');

    if (!user) return null;

    // Record visit when another logged-in user views this profile
    if (viewer && viewer.id !== userId) {
      await this._recordVisit(userId, viewer);
    }

    const docs = await populateFootprint(
      Footprint.find({ userId }).sort({ createdAt: -1 }).limit(30)
    );
    const footprints = docs.map((fp) => sanitizeLocation(fp.toObject(), isAdmin));

    const recentReactions = await Footprint.find({ 'reactions.userId': userId })
      .sort({ 'reactions.0.createdAt': -1 }).limit(5)
      .populate('userId', 'name avatarUrl');

    const recentComments = await Footprint.find({ 'comments.username': user.name })
      .sort({ 'comments.0.createdAt': -1 }).limit(5)
      .populate('userId', 'name avatarUrl');

    return { user, footprints, recentReactions, recentComments };
  }

  // ── Add comment to someone's profile ──

  async addComment(targetUserId, senderName, content) {
    if (!content) return { error: 'content is required', status: 400 };
    if (content.length > 500) return { error: '留言不能超过500字', status: 400 };

    const user = await User.findById(targetUserId);
    if (!user) return { error: 'User not found', status: 404 };

    user.profileComments.push({ senderName, content });
    await user.save();

    const updated = await User.findById(targetUserId).select('-password')
      .populate('profileReactions.senderId', 'name avatarUrl');

    bus.emit('profile:updated', { userId: targetUserId, user: updated });

    return { user: updated };
  }

  // ── Toggle reaction emoji on profile ──

  async toggleReaction(targetUserId, senderId, emoji) {
    if (!emoji) return { error: 'emoji is required', status: 400 };

    const before = await User.findOneAndUpdate(
      { _id: targetUserId },
      { $pull: { profileReactions: { senderId } } },
      { new: false }
    );

    if (!before) return { error: 'User not found', status: 404 };

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
    if (!cloudinaryUrl) return { error: 'No banner image uploaded', status: 400 };

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
      if (exists) return { error: 'Name already taken', status: 400 };
      updates.name = trimmed;
    }

    if (cloudinaryUrl) {
      updates.avatarUrl = cloudinaryUrl;
    }

    if (Object.keys(updates).length === 0) {
      return { error: 'Nothing to update', status: 400 };
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
        senderName: viewer.name,
        type: 'profile_view',
        footprintId: null,
        content: '浏览了你的主页',
      });
    }
  }
}

module.exports = new ProfileService();
