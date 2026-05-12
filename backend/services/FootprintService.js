const Footprint = require('../models/Footprint');
const User = require('../models/User');
const { reverseGeocode } = require('./nominatim');
const { getWeather } = require('./weather');
const { blurCoordinate } = require('./location');
const { notify } = require('./notification');
const { isSuperuserName } = require('./superuser');
const bus = require('../events/bus');

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

    const docs = await this._populate(
      Footprint.find(filter).sort({ createdAt: -1 })
    );

    return {
      footprints: docs.map((fp) => this._sanitize(fp, isAdmin)),
      period,
      start,
    };
  }

  async getById(footprintId, { isAdmin = false } = {}) {
    const fp = await this._populate(Footprint.findById(footprintId));
    if (!fp) return null;
    return this._sanitize(fp, isAdmin);
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

    const populated = await this._populate(Footprint.findById(footprint._id));
    const fpObj = this._sanitize(populated, isAdmin);

    bus.emit('footprint:new', { footprint: fpObj });
    bus.emit('admin:audit', {
      type: 'checkin',
      user: (populated.userId?.name || populated.userId?.toString()) || 'unknown',
      mood: mood || '📍',
      placeName: fpObj.placeName,
      timestamp: new Date().toISOString(),
    });

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

    const populated = await this._populate(Footprint.findById(footprintId));
    const fpObj = this._sanitize(populated, isAdmin);
    const footprintOwnerId = (populated.userId?._id || populated.userId).toString();

    bus.emit('footprint:updated', { footprint: fpObj });
    bus.emit('admin:audit', {
      type: 'reaction',
      user: username,
      emoji: isToggleOff ? '取消' : emoji,
      footprintId,
      timestamp: new Date().toISOString(),
    });

    if (footprintOwnerId !== userId && !isToggleOff) {
      await notify({
        recipientId: footprintOwnerId,
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

    const populated = await this._populate(Footprint.findById(fp._id));
    const fpObj = this._sanitize(populated, isAdmin);
    const footprintOwnerId = fp.userId.toString();

    bus.emit('footprint:updated', { footprint: fpObj });
    bus.emit('admin:audit', {
      type: 'comment',
      user: username,
      content: content.slice(0, 80),
      footprintId,
      timestamp: new Date().toISOString(),
    });

    if (footprintOwnerId !== userId) {
      await notify({
        recipientId: footprintOwnerId,
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
    bus.emit('admin:audit', {
      type: 'footprint_delete',
      actor: actorName,
      footprintId,
      timestamp: new Date().toISOString(),
    });

    return fp;
  }

  // ── Delete a comment from a footprint ──

  async deleteComment(footprintId, commentId, userId, userName) {
    const fp = await Footprint.findById(footprintId);
    if (!fp) return { error: 'Footprint not found', status: 404 };

    const comment = fp.comments.id(commentId);
    if (!comment) return { error: 'Comment not found', status: 404 };

    const isAuthor = comment.userId?.toString() === userId;
    const isAsen = isSuperuserName(userName);
    if (!isAuthor && !isAsen) {
      return { error: '无权删除此评论', status: 403 };
    }

    fp.comments.pull({ _id: commentId });
    await fp.save();

    const populated = await this._populate(Footprint.findById(fp._id));
    const fpObj = this._sanitize(populated, false);

    bus.emit('footprint:updated', { footprint: fpObj });

    return { footprint: fpObj };
  }

  // ═══════════════════════════════════════════════════════
  //  Private
  // ═══════════════════════════════════════════════════════

  _populate(query) {
    return query.populate('userId', 'name avatarUrl isOnline role checkinStreak');
  }

  _sanitize(populated, isAdmin) {
    const obj = populated.toObject();
    const { realLocation, ...rest } = obj;
    if (isAdmin && realLocation) {
      return { ...rest, location: realLocation };
    }
    return rest;
  }

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
