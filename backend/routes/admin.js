const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Notification = require('../models/Notification');
const { auth, admin } = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // All routes require auth + admin
  router.use(auth, admin);

  // GET /api/admin/online — list currently connected users
  router.get('/admin/online', async (req, res) => {
    try {
      const sockets = await io.fetchSockets();
      const online = sockets
        .filter((s) => s.userId)
        .map((s) => ({
          userId: s.userId,
          socketId: s.id,
          ip: s.handshake?.address || s.conn?.remoteAddress || 'unknown',
          connectedAt: s.handshake?.time || null,
        }));

      // Enrich with user names
      const userIds = online.map((o) => o.userId);
      const users = await User.find({ _id: { $in: userIds } }).select('name avatarUrl');
      const userMap = {};
      users.forEach((u) => { userMap[u._id.toString()] = u; });

      const enriched = online.map((o) => {
        const u = userMap[o.userId.toString()] || {};
        return { ...o, name: u.name || 'Unknown', avatarUrl: u.avatarUrl || '' };
      });

      res.json({ online: enriched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/users — all registered users
  router.get('/admin/users', async (req, res) => {
    try {
      const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();

      const userIds = users.map((u) => u._id);
      const counts = await Footprint.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]);
      const countMap = {};
      counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

      const result = users.map((u) => ({
        ...u,
        footprintCount: countMap[u._id.toString()] || 0,
      }));

      res.json({ users: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/admin/users/:id — update user
  router.put('/admin/users/:id', async (req, res) => {
    try {
      const { name, password } = req.body;
      const update = {};
      if (name) update.name = name;
      if (password) update.password = await bcrypt.hash(password, 10);

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
        .select('-password');

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/users/:id — delete user + their footprints + notifications
  router.delete('/admin/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.role === 'admin') {
        return res.status(403).json({ error: 'Cannot delete another admin' });
      }

      await Promise.all([
        User.findByIdAndDelete(userId),
        Footprint.deleteMany({ userId }),
        Notification.deleteMany({ recipientId: userId }),
        // Also clean up profile reactions pointing to this user
        User.updateMany(
          { 'profileReactions.senderId': userId },
          { $pull: { profileReactions: { senderId: userId } } },
        ),
      ]);

      // Disconnect the user if they are online
      const sockets = await io.fetchSockets();
      const target = sockets.find((s) => s.userId === userId);
      if (target) {
        target.emit('force_logout', { reason: '您的账户已被管理员删除' });
        target.disconnect(true);
      }

      res.json({ ok: true, message: 'User and all associated data deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/kick/:userId — force logout
  router.post('/admin/kick/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.role === 'admin') {
        return res.status(403).json({ error: 'Cannot kick another admin' });
      }

      // Set offline
      await User.findByIdAndUpdate(userId, { isOnline: false });

      // Find and disconnect socket
      const sockets = await io.fetchSockets();
      const target = sockets.find((s) => s.userId === userId);

      if (target) {
        target.emit('force_logout', { reason: '您已被管理员踢出' });
        setTimeout(() => target.disconnect(true), 200);
        res.json({ ok: true, message: `User ${user.name} has been kicked` });
      } else {
        res.json({ ok: true, message: `User ${user.name} is not online, marked offline` });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
