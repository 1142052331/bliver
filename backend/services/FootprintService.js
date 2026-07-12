const Footprint = require('../models/Footprint');
const User = require('../models/User');
const { reverseGeocodeStructured } = require('./nominatim');
const { getWeather } = require('./weather');
const { blurCoordinate, sanitizeLocation } = require('./location');
const { notify } = require('./notification');
const { populateFootprint } = require('./footprint');
const { isSuperuserName } = require('./authorization');
const bus = require('../events/bus');
const auditService = require('./AuditService');
const AppError = require('../middleware/AppError');
const {
  authorizationFilter,
  filterReadableFootprints,
  getReadableFootprint,
  getViewerAccess,
} = require('./FootprintAccessService');

class FootprintService {
  // ═══════════════════════════════════════════════════════
  //  Public: read
  // ═══════════════════════════════════════════════════════

  async getToday(period, { viewer = null, userId: filterUserId } = {}) {
    const isAdmin = viewer?.role === 'admin';
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
    if (filterUserId && isAdmin) {
      filter.userId = filterUserId;
    }
    const access = await getViewerAccess(viewer);
    const effectiveFilter = {
      $and: [filter, authorizationFilter({ ...access, now })],
    };

    const docs = await populateFootprint(
      Footprint.findSafe(effectiveFilter, { isAdmin }).sort({ createdAt: -1, _id: -1 })
    );

    const readable = await filterReadableFootprints({ access, footprints: docs, now });
    return {
      footprints: readable.map((fp) => sanitizeLocation(fp.toObject(), isAdmin)),
      period,
      start,
    };
  }

  async getById(footprintId, { viewer = null } = {}) {
    const readable = await getReadableFootprint({ viewer, footprintId });
    if (!readable) return null;
    const isAdmin = viewer?.role === 'admin';
    const fp = await populateFootprint(Footprint.findByIdSafe(readable._id, { isAdmin }));
    return sanitizeLocation(fp.toObject(), isAdmin);
  }

  // ═══════════════════════════════════════════════════════
  //  Public: mutations
  // ═══════════════════════════════════════════════════════

  async create(
    userId,
    { lat, lng, message, mood, precise, photoUrl, visibility, locationPrecision },
    { isAdmin = false, clock = () => new Date() } = {}
  ) {
    const user = await User.findById(userId).select('lastFootprintVisibility').lean();
    const effectiveVisibility = visibility || user?.lastFootprintVisibility || 'public';
    const effectiveLocationPrecision = locationPrecision || (precise ? 'precise' : 'approximate');
    const submittedLocation = { lat: Number(lat), lng: Number(lng) };
    const displayLocation = effectiveLocationPrecision === 'precise'
      ? submittedLocation
      : blurCoordinate(submittedLocation.lat, submittedLocation.lng);

    const [geography, weatherData] = await Promise.all([
      reverseGeocodeStructured(displayLocation.lat, displayLocation.lng).catch((err) => ({
        displayName: 'Unknown location',
        countryCode: '',
        countryName: '',
        regionCode: '',
        regionName: '',
        failureCode: 'reverse_geocode_failed',
      })),
      getWeather(lat, lng),
    ]);
    const publicationTime = new Date(clock());

    const weatherLine = weatherData.weather
      ? `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}`
      : '';

    const footprintData = {
      userId,
      createdAt: publicationTime,
      location: displayLocation,
      placeName: geography.displayName || 'Unknown location',
      message: [weatherLine, message || ''].filter(Boolean).join('\n'),
      photoUrl: photoUrl || '',
      mood: mood || '',
      visibility: effectiveVisibility,
      locationPrecision: effectiveLocationPrecision,
      countryCode: geography.countryCode || '',
      countryName: geography.countryName || '',
      regionCode: geography.regionCode || '',
      regionName: geography.regionName || '',
      discoveryOrigin: 'publication',
      discoveryWindowToken: '',
      discoveryExpiresAt: effectiveVisibility === 'public'
        ? new Date(publicationTime.getTime() + 24 * 60 * 60 * 1000)
        : null,
      regionBackfill: {
        status: geography.failureCode ? 'failed' : 'complete',
        attempts: 1,
        lastAttemptAt: publicationTime,
        error: geography.failureCode || '',
      },
    };

    if (effectiveLocationPrecision === 'approximate') {
      footprintData.realLocation = submittedLocation;
    }

    const footprint = await Footprint.create(footprintData);
    try {
      await User.findByIdAndUpdate(userId, {
        $set: { lastFootprintVisibility: effectiveVisibility },
      });
    } catch {
      console.error('[FootprintService] Visibility preference update failed');
    }
    try {
      await this._updateStreak(userId);
    } catch {
      console.error('[FootprintService] Streak update failed');
    }

    let plain;
    try {
      const populated = await populateFootprint(Footprint.findById(footprint._id));
      if (!populated) throw new Error('Footprint readback unavailable');
      plain = populated.toObject();
    } catch {
      console.error('[FootprintService] Post-create readback failed');
      plain = footprint.toObject();
    }
    const fpObj = sanitizeLocation(plain, isAdmin);

    bus.emit('footprint:new', { footprint: sanitizeLocation(plain, false) });

    return fpObj;
  }

  async react(footprintId, userId, username, emoji, { viewer } = {}) {
    const readable = await getReadableFootprint({ viewer, footprintId });
    if (!readable) return null;
    const isAdmin = viewer?.role === 'admin';
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
    const plain = populated.toObject();
    const fpObj = sanitizeLocation(plain, isAdmin);
    const footprintOwnerId = (populated.userId?._id || populated.userId).toString();

    bus.emit('footprint:updated', { footprint: sanitizeLocation(plain, false) });

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

  async comment(footprintId, userId, username, content, ip, { viewer } = {}) {
    const fp = await getReadableFootprint({ viewer, footprintId });
    if (!fp) return null;
    const isAdmin = viewer?.role === 'admin';

    fp.comments.push({ userId, username, content, ipAddress: ip });
    await fp.save();

    const populated = await populateFootprint(Footprint.findById(fp._id));
    const plain = populated.toObject();
    const fpObj = sanitizeLocation(plain, isAdmin);
    const footprintOwnerId = fp.userId.toString();

    bus.emit('footprint:updated', { footprint: sanitizeLocation(plain, false) });

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

  async deleteComment(footprintId, commentId, userId, userName, { viewer } = {}) {
    const fp = await getReadableFootprint({ viewer, footprintId });
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
