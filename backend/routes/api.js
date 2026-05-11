const express = require('express');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const { reverseGeocode } = require('../services/nominatim');
const { getWeather } = require('../services/weather');
const { blurCoordinate, sanitizeLocation } = require('../services/location');
const { populateFootprint } = require('../services/footprint');
const { makeCreateNotification } = require('../services/notification');

const authRoutes = require('./auth');
const notificationRoutes = require('./notifications');

module.exports = (io) => {
  const router = express.Router();

  // Mount sub-routers
  router.use(authRoutes());
  router.use(notificationRoutes());

  // Shared helper: create notification (DB + socket + push)
  const createNotification = makeCreateNotification(io);

  // ── Footprints ────────────────────────────────────────

  // GET /api/footprints/today?period=today|week|year
  router.get('/footprints/today', optionalAuth, async (req, res) => {
    try {
      const period = req.query.period || 'today';
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

      const docs = await populateFootprint(
        Footprint.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 })
      );

      const footprints = docs.map((fp) => {
        const obj = fp.toObject();
        return sanitizeLocation(obj, req.isAdmin);
      });

      res.json({ footprints, period, start });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/footprints/:id
  router.get('/footprints/:id', optionalAuth, async (req, res) => {
    try {
      const fp = await populateFootprint(Footprint.findById(req.params.id));
      if (!fp) return res.status(404).json({ error: 'Not found' });
      res.json({ footprint: sanitizeLocation(fp.toObject(), req.isAdmin) });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/checkin
  router.post('/checkin', auth, contentLimiter, upload.single('photo'), uploadToCloudinary, async (req, res) => {
    try {
      const { lat, lng, message, mood, precise } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat, lng are required' });
      }
      if (message && message.length > 1000) {
        return res.status(400).json({ error: '内容不能超过1000字' });
      }

      const latNum = Number(lat);
      const lngNum = Number(lng);
      const isPrecise = precise === 'true';

      const displayLocation = isPrecise
        ? { lat: latNum, lng: lngNum }
        : blurCoordinate(latNum, lngNum);

      const [placeName, weatherData] = await Promise.all([
        reverseGeocode(displayLocation.lat, displayLocation.lng),
        getWeather(latNum, lngNum),
      ]);

      const footprintData = {
        userId:    req.user.id,
        location:  displayLocation,
        placeName: placeName,
        message:   `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}\n${message || ''}`,
        photoUrl:  req.cloudinaryUrl || '',
        mood:      mood || '',
      };

      if (!isPrecise) {
        footprintData.realLocation = { lat: latNum, lng: lngNum };
      }

      const footprint = await Footprint.create(footprintData);

      // Update daily check-in streak atomically
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Try: consecutive day → increment
      const incResult = await User.findOneAndUpdate(
        { _id: req.user.id, 'checkinStreak.lastCheckinDate': yesterday },
        { $inc: { 'checkinStreak.current': 1 }, $set: { 'checkinStreak.lastCheckinDate': today } }
      );

      if (!incResult) {
        // Not consecutive, or first checkin — reset to 1 (unless already checked in today)
        await User.findOneAndUpdate(
          { _id: req.user.id, 'checkinStreak.lastCheckinDate': { $ne: today } },
          { $set: { 'checkinStreak': { current: 1, lastCheckinDate: today } } }
        );
      }

      const populated = await populateFootprint(Footprint.findById(footprint._id));
      const fpObj = populated.toObject();

      res.status(201).json({ footprint: sanitizeLocation(fpObj, req.user.role === 'admin') });
      delete fpObj.realLocation;
      io.emit('footprint:new', { footprint: fpObj });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/footprints/:id/react
  router.post('/footprints/:id/react', auth, contentLimiter, async (req, res) => {
    try {
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji is required' });

      const userId = req.user.id;
      const username = req.user.name;

      // Atomically remove any existing reaction by this user
      const before = await Footprint.findOneAndUpdate(
        { _id: req.params.id },
        { $pull: { reactions: { userId } } },
        { new: false }
      );

      if (!before) return res.status(404).json({ error: 'Not found' });

      const oldReaction = before.reactions.find(r => r.userId.toString() === userId);
      const isToggleOff = oldReaction && oldReaction.emoji === emoji;

      if (!isToggleOff) {
        await Footprint.findByIdAndUpdate(req.params.id, {
          $push: { reactions: { userId, username, emoji } }
        });
      }

      const populated = await populateFootprint(Footprint.findById(req.params.id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      io.emit('footprint:updated', { footprint: fpObj });

      if (populated.userId.toString() !== userId && !isToggleOff) {
        await createNotification({
          recipientId: populated.userId,
          senderName: username,
          type: 'reaction',
          footprintId: populated._id,
          content: emoji,
        });
      }

      res.json({ footprint: fpObj });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/footprints/:id/comment
  router.post('/footprints/:id/comment', auth, contentLimiter, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });
      if (content.length > 500) return res.status(400).json({ error: '评论不能超过500字' });

      const fp = await Footprint.findById(req.params.id);
      if (!fp) return res.status(404).json({ error: 'Not found' });

      const username = req.user.name;
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.ip
        || req.socket.remoteAddress
        || '';

      fp.comments.push({ userId: req.user.id, username, content, ipAddress: ip });
      await fp.save();

      const populated = await populateFootprint(Footprint.findById(fp._id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      io.emit('footprint:updated', { footprint: fpObj });

      if (fp.userId.toString() !== req.user.id) {
        await createNotification({
          recipientId: fp.userId,
          senderName: username,
          type: 'comment',
          footprintId: fp._id,
          content: content.length > 50 ? content.slice(0, 50) + '...' : content,
        });
      }

      res.status(201).json({ footprint: populated });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/footprints/:footprintId/comments/:commentId
  router.delete('/footprints/:footprintId/comments/:commentId', auth, contentLimiter, async (req, res) => {
    try {
      const fp = await Footprint.findById(req.params.footprintId);
      if (!fp) return res.status(404).json({ error: 'Footprint not found' });

      const comment = fp.comments.id(req.params.commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found' });

      // 只有 阿森 或评论原作者才能删除
      const isAuthor = comment.userId?.toString() === req.user.id;
      const isAsen = req.user.name === '阿森';
      if (!isAuthor && !isAsen) {
        return res.status(403).json({ error: '无权删除此评论' });
      }

      fp.comments.pull({ _id: req.params.commentId });
      await fp.save();

      // 返回更新后的足迹
      const populated = await populateFootprint(Footprint.findById(fp._id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      io.emit('footprint:updated', { footprint: fpObj });

      res.json({ footprint: fpObj });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/footprints/:id (admin only)
  router.delete('/footprints/:id', auth, admin, async (req, res) => {
    try {
      const fp = await Footprint.findByIdAndDelete(req.params.id);
      if (!fp) return res.status(404).json({ error: 'Not found' });

      io.emit('footprint:deleted', { footprintId: req.params.id });

      res.json({ ok: true });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Profile ──────────────────────────────────────────

  // GET /api/users/:id/profile
  router.get('/users/:id/profile', optionalAuth, async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl')
        .populate('profileVisitors.visitorId', 'name avatarUrl');

      if (!user) return res.status(404).json({ error: 'User not found' });

      // Record visit when another logged-in user views this profile
      if (req.user && req.user.id !== req.params.id) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Atomically try to update existing visitor's timestamp (already visited today)
        const existed = await User.findOneAndUpdate(
          { _id: req.params.id, 'profileVisitors.visitorId': req.user.id, 'profileVisitors.visitedAt': { $gte: today } },
          { $set: { 'profileVisitors.$.visitedAt': new Date() } }
        );

        if (!existed) {
          // New visitor — atomically push and cap at 30
          await User.findByIdAndUpdate(req.params.id, {
            $push: { profileVisitors: { $each: [{ visitorId: req.user.id, visitedAt: new Date() }], $slice: -30 } }
          });

          await createNotification({
            recipientId: req.params.id,
            senderName: req.user.name,
            type: 'profile_view',
            footprintId: null,
            content: '浏览了你的主页',
          });
        }
      }

      const docs = await populateFootprint(
        Footprint.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(30)
      );
      const footprints = docs.map((fp) => sanitizeLocation(fp.toObject(), req.isAdmin));

      const recentReactions = await Footprint.find({ 'reactions.userId': req.params.id })
        .sort({ 'reactions.0.createdAt': -1 }).limit(5)
        .populate('userId', 'name avatarUrl');
      const recentComments = await Footprint.find({ 'comments.username': user.name })
        .sort({ 'comments.0.createdAt': -1 }).limit(5)
        .populate('userId', 'name avatarUrl');

      res.json({ user, footprints, recentReactions, recentComments });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/users/:id/profile/comment
  router.post('/users/:id/profile/comment', auth, contentLimiter, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });
      if (content.length > 500) return res.status(400).json({ error: '留言不能超过500字' });

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      user.profileComments.push({ senderName: req.user.name, content });
      await user.save();

      const updated = await User.findById(req.params.id).select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl');

      io.emit('profile:updated', { userId: req.params.id, user: updated });

      res.status(201).json({ user: updated });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/users/:id/profile/react
  router.post('/users/:id/profile/react', auth, contentLimiter, async (req, res) => {
    try {
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji is required' });

      const senderId = req.user.id;

      // Atomically remove any existing reaction by this user
      const before = await User.findOneAndUpdate(
        { _id: req.params.id },
        { $pull: { profileReactions: { senderId } } },
        { new: false }
      );

      if (!before) return res.status(404).json({ error: 'User not found' });

      const oldReaction = before.profileReactions.find(r => r.senderId?.toString() === senderId);
      const isToggleOff = oldReaction && oldReaction.emoji === emoji;

      if (!isToggleOff) {
        await User.findByIdAndUpdate(req.params.id, {
          $push: { profileReactions: { senderId, emoji } }
        });
      }

      const updated = await User.findById(req.params.id).select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl');

      io.emit('profile:updated', { userId: req.params.id, user: updated });

      res.json({ user: updated });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/users/profile/banner
  router.post('/users/profile/banner', auth, upload.single('banner'), uploadToCloudinary, async (req, res) => {
    try {
      if (!req.cloudinaryUrl) return res.status(400).json({ error: 'No banner image uploaded' });

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profileBannerUrl: req.cloudinaryUrl },
        { returnDocument: 'after' }
      ).select('-password');

      io.emit('profile:updated', { userId: req.user.id, user });

      res.json({ user });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/users/profile — update name or avatar
  router.put('/users/profile', auth, upload.single('avatar'), uploadToCloudinary, async (req, res) => {
    try {
      const { name } = req.body;
      const updates = {};

      if (name && name.trim()) {
        const trimmed = name.trim();
        const exists = await User.findOne({ name: trimmed, _id: { $ne: req.user.id } });
        if (exists) return res.status(400).json({ error: 'Name already taken' });
        updates.name = trimmed;
      }

      if (req.cloudinaryUrl) {
        updates.avatarUrl = req.cloudinaryUrl;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      const user = await User.findByIdAndUpdate(req.user.id, updates, { returnDocument: 'after' }).select('-password');

      io.emit('profile:updated', { userId: req.user.id, user });

      res.json({ user });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Admin setup ───────────────────────────────────────

  router.post('/admin/setup', auth, async (req, res) => {
    try {
      const adminSecret = process.env.ADMIN_SETUP_SECRET;
      if (!adminSecret) return res.status(500).json({ error: 'Not configured' });
      if (req.body.secret !== adminSecret) {
        return res.status(403).json({ error: 'Wrong secret' });
      }
      await User.findByIdAndUpdate(req.user.id, { role: 'admin' });
      res.json({ ok: true, message: 'Admin role granted' });
    } catch (err) {
      console.error('[api]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
