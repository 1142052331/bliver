const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Notification = require('../models/Notification');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, JWT_SECRET } = require('../middleware/auth');
const { reverseGeocode } = require('../services/nominatim');
const { getWeather } = require('../services/weather');

module.exports = (io) => {
  const router = express.Router();

  // ── Auth ──────────────────────────────────────────────

  // POST /api/auth/register
  router.post('/auth/register', upload.single('avatar'), uploadToCloudinary, async (req, res) => {
    try {
      const { name, password } = req.body;
      if (!name || !password) return res.status(400).json({ error: 'Name and password required' });

      const exists = await User.findOne({ name });
      if (exists) return res.status(400).json({ error: 'Name already taken' });

      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        password: hash,
        avatarUrl: req.cloudinaryUrl || '',
      });

      const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      res.status(201).json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', async (req, res) => {
    try {
      const { name, password } = req.body;
      const user = await User.findOne({ name });
      if (!user) return res.status(400).json({ error: 'User not found' });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).json({ error: 'Wrong password' });

      // Auto-promote 阿森 to admin
      if (user.name === '阿森' && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }

      const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/me
  router.get('/auth/me', auth, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');

    // Auto-promote 阿森 to admin
    if (user && user.name === '阿森' && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    res.json({ user });
  });

  // ── Helpers ───────────────────────────────────────────

  const populateFootprint = (q) =>
    q.populate('userId', 'name avatarUrl isOnline role');

  async function createNotification({ recipientId, senderName, type, footprintId, content }) {
    const notif = await Notification.create({ recipientId, senderName, type, footprintId, content });
    io.to(recipientId.toString()).emit('new_notification', { notification: notif });
  }

  // ── Footprints ────────────────────────────────────────

  // GET /api/footprints/today
  router.get('/footprints/today', async (req, res) => {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const footprints = await populateFootprint(
        Footprint.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 })
      );

      res.json({ footprints });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/footprints/:id
  router.get('/footprints/:id', async (req, res) => {
    try {
      const fp = await populateFootprint(Footprint.findById(req.params.id));
      if (!fp) return res.status(404).json({ error: 'Not found' });
      res.json({ footprint: fp });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/checkin (protected)
  router.post('/checkin', auth, upload.single('photo'), uploadToCloudinary, async (req, res) => {
    try {
      const { lat, lng, message, mood } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat, lng are required' });
      }

      const latNum = Number(lat);
      const lngNum = Number(lng);

      const [placeName, weatherData] = await Promise.all([
        reverseGeocode(latNum, lngNum),
        getWeather(latNum, lngNum),
      ]);

      const footprint = await Footprint.create({
        userId:    req.user.id,
        location:  { lat: latNum, lng: lngNum },
        placeName: placeName,
        message:   `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}\n${message || ''}`,
        photoUrl:  req.cloudinaryUrl || '',
        mood:      mood || '',
      });

      const populated = await populateFootprint(Footprint.findById(footprint._id));

      io.emit('footprint:new', { footprint: populated });

      res.status(201).json({ footprint: populated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/footprints/:id/react (protected)
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
          // Same emoji clicked again — remove reaction
          fp.reactions.pull({ userId });
        } else {
          // Different emoji — update
          existing.emoji = emoji;
        }
      } else {
        // New reaction
        fp.reactions.push({ userId, username, emoji });
      }

      await fp.save();

      const populated = await populateFootprint(Footprint.findById(fp._id));

      io.emit('footprint:updated', { footprint: populated });

      // Create notification if reacting to someone else's footprint
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

  // POST /api/footprints/:id/comment (protected)
  router.post('/footprints/:id/comment', auth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }

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

      io.emit('footprint:updated', { footprint: populated });

      // Create notification if commenting on someone else's footprint
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

  // ── Notifications ─────────────────────────────────────

  // GET /api/notifications (protected)
  router.get('/notifications', auth, async (req, res) => {
    try {
      const notifs = await Notification.find({ recipientId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json({ notifications: notifs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/notifications/:id/read (protected)
  router.put('/notifications/:id/read', auth, async (req, res) => {
    try {
      await Notification.findOneAndUpdate(
        { _id: req.params.id, recipientId: req.user.id },
        { isRead: true }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Profile ──────────────────────────────────────────

  // GET /api/users/:id/profile
  router.get('/users/:id/profile', async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .select('-password')
        .populate('profileReactions.senderId', 'name avatarUrl');

      if (!user) return res.status(404).json({ error: 'User not found' });

      const footprints = await populateFootprint(
        Footprint.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(30)
      );

      // Recent interactions: latest liked/commented footprints by this user
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

      user.profileComments.push({
        senderName: req.user.name,
        content,
      });
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
      const existing = user.profileReactions.find(
        (r) => r.senderId.toString() === senderId
      );

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

  // ── Admin setup ───────────────────────────────────────

  // POST /api/admin/setup (logged-in user + secret key)
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
