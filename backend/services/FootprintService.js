const Footprint = require('../models/Footprint');
const User = require('../models/User');
const { reverseGeocode } = require('./nominatim');
const { getWeather } = require('./weather');
const { blurCoordinate, sanitizeLocation } = require('./location');
const { notify } = require('./notification');
const { populateFootprint } = require('./footprint');
const { isSuperuserName } = require('./authorization');
const bus = require('../events/bus');
const auditService = require('./AuditService');
const AppError = require('../middleware/AppError');

class FootprintService {
  // ═══════════════════════════════════════════════════════
  //  Public: read
  // ═══════════════════════════════════════════════════════

  async getToday(period, { isAdmin = false, userId: filterUserId, isAdminMode = false } = {}) {
    const now = new Date();
    let start;

    if (period === 'year') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    } else if (period === 'week') {
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start = new Date(now);
      start.setDate(now.getDate() + mondayOffset);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const filter = { createdAt: { $gte: start, $lte: end } };
    if (filterUserId && isAdminMode) {
      filter.userId = filterUserId;
    }

    const docs = await populateFootprint(
      Footprint.findSafe(filter, { isAdmin }).sort({ createdAt: -1 })
    );

    return {
      footprints: docs.map((fp) => sanitizeLocation(fp.toObject(), isAdmin)),
      period,
      start,
    };
  }

  async getById(footprintId, { isAdmin = false } = {}) {
    const fp = await populateFootprint(Footprint.findByIdSafe(footprintId, { isAdmin }));
    if (!fp) return null;
    return sanitizeLocation(fp.toObject(), isAdmin);
  }

  // ═══════════════════════════════════════════════════════
  //  Public: mutations
  // ═══════════════════════════════════════════════════════

  async create(userId, { lat, lng, message, mood, precise, photoUrl }, { isAdmin = false } = {}) {
    const displayLocation = precise
      ? { lat: Number(lat), lng: Number(lng) }
      : blurCoordinate(Number(lat), Number(lng));

    const [placeName, weatherData] = await Promise.all([
      reverseGeocode(displayLocation.lat, displayLocation.lng),
      getWeather(lat, lng),
    ]);

    const weatherLine = weatherData.weather
      ? `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}`
      : '';

    const footprintData = {
      userId,
      location: displayLocation,
      placeName,
      message: [weatherLine, message || ''].filter(Boolean).join('\n'),
      photoUrl: photoUrl || '',
      mood: mood || '',
    };

    if (!precise) {
      footprintData.realLocation = { lat: Number(lat), lng: Number(lng) };
    }

    const footprint = await Footprint.create(footprintData);
    await this._updateStreak(userId);

    const populated = await populateFootprint(Footprint.findById(footprint._id));
    const fpObj = sanitizeLocation(populated.toObject(), isAdmin);

    bus.emit('footprint:new', { footprint: fpObj });

    return fpObj;
  }

  async react(footprintId, userId, username, emoji, { isAdmin = false } = {}) {
    const before = await Footprint.findOneAndUpdate(
      { _id: footprintId },
      { $pull: { reactions: { userId } } },
      { new: false }
    );

    if (!before) return null;

    const oldReaction = before.reactions.find(r => r.userId.toString() === userId);
    const isToggleOff = oldReaction && oldReaction.emoji === emoji;

    if (!isToggleOff) {
      await Footprint.findByIdAndUpdate(footprintId, {
        $push: { reactions: { userId, username, emoji } },
      });
    }

    const populated = await populateFootprint(Footprint.findById(footprintId));
    const fpObj = sanitizeLocation(populated.toObject(), isAdmin);
    const footprintOwnerId = (populated.userId?._id || populated.userId).toString();

    bus.emit('footprint:updated', { footprint: fpObj });

    if (footprintOwnerId !== userId && !isToggleOff) {
      await notify({
        recipientId: footprintOwnerId,
        senderId: userId,
        senderName: username,
        type: 'reaction',
        footprintId,
        content: emoji,
      });
    }

    return { footprint: fpObj, isToggleOff };
  }

  async comment(footprintId, userId, username, content, ip, { isAdmin = false } = {}) {
    const fp = await Footprint.findById(footprintId);
    if (!fp) return null;

    fp.comments.push({ userId, username, content, ipAddress: ip });
    await fp.save();

    const populated = await populateFootprint(Footprint.findById(fp._id));
    const fpObj = sanitizeLocation(populated.toObject(), isAdmin);
    const footprintOwnerId = fp.userId.toString();

    bus.emit('footprint:updated', { footprint: fpObj });

    if (footprintOwnerId !== userId) {
      await notify({
        recipientId: footprintOwnerId,
        senderId: userId,
        senderName: username,
        type: 'comment',
        footprintId,
        content: content.length > 50 ? content.slice(0, 50) + '...' : content,
      });
    }

    return { footprint: fpObj };
  }

  async delete(footprintId, actorName) {
    const fp = await Footprint.findByIdAndDelete(footprintId);
    if (!fp) return null;

    bus.emit('footprint:deleted', { footprintId });
    auditService.log({ type: 'footprint_delete', actor: actorName, detail: footprintId });

    return fp;
  }

  // ── Delete a comment from a footprint ──

  async deleteComment(footprintId, commentId, userId, userName) {
    const fp = await Footprint.findById(footprintId);
    if (!fp) throw new AppError(404, 'Footprint not found');

    const comment = fp.comments.id(commentId);
    if (!comment) throw new AppError(404, 'Comment not found');

    const isAuthor = comment.userId?.toString() === userId;
    const isAsen = isSuperuserName(userName);
    if (!isAuthor && !isAsen) {
      throw new AppError(403, '无权删除此评论');
    }

    fp.comments.pull({ _id: commentId });
    await fp.save();

    const populated = await populateFootprint(Footprint.findById(fp._id));
    const fpObj = sanitizeLocation(populated.toObject(), false);

    bus.emit('footprint:updated', { footprint: fpObj });

    return { footprint: fpObj };
  }

  // ═══════════════════════════════════════════════════════
  //  Private
  // ═══════════════════════════════════════════════════════

  async _updateStreak(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const incResult = await User.findOneAndUpdate(
      { _id: userId, 'checkinStreak.lastCheckinDate': yesterday },
      { $inc: { 'checkinStreak.current': 1 }, $set: { 'checkinStreak.lastCheckinDate': today } }
    );

    if (!incResult) {
      await User.findOneAndUpdate(
        { _id: userId, 'checkinStreak.lastCheckinDate': { $ne: today } },
        { $set: { 'checkinStreak': { current: 1, lastCheckinDate: today } } }
      );
    }
  }
}

module.exports = new FootprintService();
