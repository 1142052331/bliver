const express = require('express');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const { sanitizeLocation } = require('../services/location');
const { checkIn } = require('../services/checkin');
const { toggleReaction } = require('../services/reaction');
const { addComment } = require('../services/comment');
const { populateFootprint } = require('../services/footprint');
const { makeCreateNotification } = require('../services/notification');
const bus = require('../events/bus');
const validate = require('../middleware/validate');
const { checkin: checkinSchema, comment: commentSchema, reaction: reactionSchema } = require('../validators/schemas');
const { isSuperuserName } = require('../services/superuser');

const authRoutes = require('./auth');
const notificationRoutes = require('./notifications');

module.exports = () => {
  const router = express.Router();

  // Mount sub-routers
  router.use(authRoutes());
  router.use(notificationRoutes());

  // Shared helper: create notification (DB + socket + push)
  const createNotification = makeCreateNotification();

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

      const filter = { createdAt: { $gte: start, $lte: end } };
      // Admin ghost mode: filter by specific userId
      if (req.query.userId && req.isAdmin) {
        filter.userId = req.query.userId;
      }

      const docs = await populateFootprint(
        Footprint.find(filter).sort({ createdAt: -1 })
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
  router.post('/checkin', auth, contentLimiter, upload.single('photo'), uploadToCloudinary, validate(checkinSchema), async (req, res, next) => {
    try {
      const { lat, lng, message, mood, precise } = req.body;

      const fpObj = await checkIn(req.user.id, {
        lat, lng, message, mood, precise,
        photoUrl: req.cloudinaryUrl || '',
      });

      res.status(201).json({ footprint: sanitizeLocation(fpObj, req.user.role === 'admin') });
      delete fpObj.realLocation;
      bus.emit('footprint:new', { footprint: fpObj });
      bus.emit('admin:audit', { type: 'checkin', user: req.user.name, mood: mood || '📍', placeName: fpObj.placeName, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/footprints/:id/react
  router.post('/footprints/:id/react', auth, contentLimiter, validate(reactionSchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const username = req.user.name;
      const { emoji } = req.body;

      const result = await toggleReaction(req.params.id, userId, username, emoji);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const { footprint, isToggleOff, footprintOwnerId } = result;

      bus.emit('footprint:updated', { footprint });
      bus.emit('admin:audit', { type: 'reaction', user: username, emoji: isToggleOff ? '取消' : emoji, footprintId: req.params.id, timestamp: new Date().toISOString() });

      if (footprintOwnerId !== userId && !isToggleOff) {
        await createNotification({
          recipientId: footprintOwnerId,
          senderName: username,
          type: 'reaction',
          footprintId: footprint._id,
          content: emoji,
        });
      }

      res.json({ footprint });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/footprints/:id/comment
  router.post('/footprints/:id/comment', auth, contentLimiter, validate(commentSchema), async (req, res, next) => {
    try {
      const { content } = req.body;
      const username = req.user.name;
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.ip
        || req.socket.remoteAddress
        || '';

      const result = await addComment(req.params.id, req.user.id, username, content, ip);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const { footprint, footprintOwnerId } = result;

      bus.emit('footprint:updated', { footprint });
      bus.emit('admin:audit', { type: 'comment', user: username, content: content.slice(0, 80), footprintId: req.params.id, timestamp: new Date().toISOString() });

      if (footprintOwnerId !== req.user.id) {
        await createNotification({
          recipientId: footprintOwnerId,
          senderName: username,
          type: 'comment',
          footprintId: footprint._id,
          content: content.length > 50 ? content.slice(0, 50) + '...' : content,
        });
      }

      res.status(201).json({ footprint });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/footprints/:footprintId/comments/:commentId
  router.delete('/footprints/:footprintId/comments/:commentId', auth, contentLimiter, async (req, res) => {
    try {
      const fp = await Footprint.findById(req.params.footprintId);
      if (!fp) return res.status(404).json({ error: 'Footprint not found' });

      const comment = fp.comments.id(req.params.commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found' });

      // Only superuser or comment author can delete
      const isAuthor = comment.userId?.toString() === req.user.id;
      const isAsen = isSuperuserName(req.user.name);
      if (!isAuthor && !isAsen) {
        return res.status(403).json({ error: '无权删除此评论' });
      }

      fp.comments.pull({ _id: req.params.commentId });
      await fp.save();

      // 返回更新后的足迹
      const populated = await populateFootprint(Footprint.findById(fp._id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      bus.emit('footprint:updated', { footprint: fpObj });

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

      bus.emit('footprint:deleted', { footprintId: req.params.id });
      bus.emit('admin:audit', { type: 'footprint_delete', actor: req.user.name, footprintId: req.params.id, timestamp: new Date().toISOString() });

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

      bus.emit('profile:updated', { userId: req.params.id, user: updated });

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

      bus.emit('profile:updated', { userId: req.params.id, user: updated });

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

      bus.emit('profile:updated', { userId: req.user.id, user });

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

      bus.emit('profile:updated', { userId: req.user.id, user });

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
