const express = require('express');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, optionalAuth } = require('../middleware/auth');
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
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/footprints/:id
  router.get('/footprints/:id', optionalAuth, async (req, res) => {
    try {
      const fp = await populateFootprint(Footprint.findById(req.params.id));
      if (!fp) return res.status(404).json({ error: 'Not found' });
      res.json({ footprint: sanitizeLocation(fp.toObject(), req.isAdmin) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/checkin
  router.post('/checkin', auth, upload.single('photo'), uploadToCloudinary, async (req, res) => {
    try {
      const { lat, lng, message, mood, precise } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat, lng are required' });
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

      // Update daily check-in streak
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const streakUser = await User.findById(req.user.id);
      const lastDate = streakUser.checkinStreak?.lastCheckinDate;
      let newStreak = 1;

      if (lastDate) {
        const last = new Date(lastDate);
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          newStreak = streakUser.checkinStreak.current;
        } else if (diffDays === 1) {
          newStreak = streakUser.checkinStreak.current + 1;
        }
      }

      await User.findByIdAndUpdate(req.user.id, {
        checkinStreak: { current: newStreak, lastCheckinDate: today },
      });

      const populated = await populateFootprint(Footprint.findById(footprint._id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      io.emit('footprint:new', { footprint: fpObj });

      res.status(201).json({ footprint: sanitizeLocation(fpObj, req.user.role === 'admin') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/footprints/:id/react
  router.post('/footprints/:id/react', auth, async (req, res) => {
    try {
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji is required' });

      const fp = await Footprint.findById(req.params.id);
      if (!fp) return res.status(404).json({ error: 'Not found' });

      const userId = req.user.id;
      const username = req.user.name;
      const existing = fp.reactions.find((r) => r.userId.toString() === userId);

      if (existing) {
        if (existing.emoji === emoji) {
          fp.reactions.pull({ userId });
        } else {
          existing.emoji = emoji;
        }
      } else {
        fp.reactions.push({ userId, username, emoji });
      }

      await fp.save();

      const populated = await populateFootprint(Footprint.findById(fp._id));
      const fpObj = populated.toObject();
      delete fpObj.realLocation;

      io.emit('footprint:updated', { footprint: fpObj });

      if (fp.userId.toString() !== userId) {
        const action = existing && existing.emoji === emoji ? null : fp.reactions.find(r => r.userId.toString() === userId);
        if (action) {
          await createNotification({
            recipientId: fp.userId,
            senderName: username,
            type: 'reaction',
            footprintId: fp._id,
            content: emoji,
          });
        }
      }

      res.json({ footprint: populated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/footprints/:id/comment
  router.post('/footprints/:id/comment', auth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });

      const fp = await Footprint.findById(req.params.id);
      if (!fp) return res.status(404).json({ error: 'Not found' });

      const username = req.user.name;
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.ip
        || req.socket.remoteAddress
        || '';

      fp.comments.push({ username, content, ipAddress: ip });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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

        let alreadyVisitedToday = false;

        for (const v of user.profileVisitors) {
          if (v.visitorId?.toString() === req.user.id && new Date(v.visitedAt) >= today) {
            v.visitedAt = new Date();
            alreadyVisitedToday = true;
            break;
          }
        }

        if (!alreadyVisitedToday) {
          user.profileVisitors.push({ visitorId: req.user.id });
        }

        if (user.profileVisitors.length > 30) {
          user.profileVisitors = user.profileVisitors.slice(-30);
        }
        await user.save();

        if (!alreadyVisitedToday) {
          await createNotification({
            recipientId: req.params.id,
            senderName: req.user.name,
            type: 'profile_view',
            footprintId: null,
            content: '浏览了你的主页',
          });
        }

        await user.populate('profileVisitors.visitorId', 'name avatarUrl');
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
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/users/:id/profile/comment
  router.post('/users/:id/profile/comment', auth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      user.profileComments.push({ senderName: req.user.name, content });
      await user.save();

      const updated = await User.findById(req.params.id).select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl');

      io.emit('profile:updated', { userId: req.params.id, user: updated });

      res.status(201).json({ user: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/users/:id/profile/react
  router.post('/users/:id/profile/react', auth, async (req, res) => {
    try {
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji is required' });

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const senderId = req.user.id;
      const existing = user.profileReactions.find((r) => r.senderId.toString() === senderId);

      if (existing) {
        if (existing.emoji === emoji) {
          user.profileReactions.pull({ senderId });
        } else {
          existing.emoji = emoji;
        }
      } else {
        user.profileReactions.push({ senderId, emoji });
      }

      await user.save();

      const updated = await User.findById(req.params.id).select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl');

      io.emit('profile:updated', { userId: req.params.id, user: updated });

      res.json({ user: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/users/profile/banner
  router.post('/users/profile/banner', auth, upload.single('banner'), uploadToCloudinary, async (req, res) => {
    try {
      if (!req.cloudinaryUrl) return res.status(400).json({ error: 'No banner image uploaded' });

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profileBannerUrl: req.cloudinaryUrl },
        { new: true }
      ).select('-password');

      io.emit('profile:updated', { userId: req.user.id, user });

      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
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

      const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');

      io.emit('profile:updated', { userId: req.user.id, user });

      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin setup ───────────────────────────────────────

  router.post('/admin/setup', auth, async (req, res) => {
    try {
      if (req.body.secret !== 'bliver_admin_2026') {
        return res.status(403).json({ error: 'Wrong secret' });
      }
      await User.findByIdAndUpdate(req.user.id, { role: 'admin' });
      res.json({ ok: true, message: 'Admin role granted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
