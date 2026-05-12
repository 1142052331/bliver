const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Notification = require('../models/Notification');
const { auth, admin } = require('../middleware/auth');
const bus = require('../events/bus');
const socketRegistry = require('../socket/registry');

module.exports = () => {
  const router = express.Router();

  // All /admin routes require auth + admin
  router.use('/admin', auth, admin);

  // GET /api/admin/online — list currently connected users
  router.get('/admin/online', async (req, res) => {
    try {
      const online = await socketRegistry.getOnlineUsers();

      // Enrich with user names
      const userIds = online.map((o) => o.userId);
      const users = await User.find({ _id: { $in: userIds } }).select('name avatarUrl registerIp lastLoginIp');
      const userMap = {};
      users.forEach((u) => { userMap[u._id.toString()] = u; });

      const enriched = online.map((o) => {
        const u = userMap[o.userId.toString()] || {};
        return { ...o, name: u.name || 'Unknown', avatarUrl: u.avatarUrl || '', registerIp: u.registerIp || '', lastLoginIp: u.lastLoginIp || '' };
      });

      res.json({ online: enriched });
    } catch (err) {
      console.error('[admin]', err); res.status(500).json({ error: 'Internal server error' });
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
      console.error('[admin]', err); res.status(500).json({ error: 'Internal server error' });
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

      const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', runValidators: true })
        .select('-password');

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({ user });
      bus.emit('admin:audit', { type: 'user_edit', actor: req.user.name, target: user.name, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[admin]', err); res.status(500).json({ error: 'Internal server error' });
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

      await socketRegistry.disconnectUser(userId, '您的账户已被管理员删除');

      res.json({ ok: true, message: 'User and all associated data deleted' });
      bus.emit('admin:audit', { type: 'delete', actor: req.user.name, target: user.name, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[admin]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/clones — group users by shared IPs to detect alt accounts
  // Uses MongoDB $group aggregation to leverage indexes on registerIp / lastLoginIp
  router.get('/admin/clones', async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();

      const [registerGroups, loginGroups] = await Promise.all([
        User.aggregate([
          { $match: { registerIp: { $ne: '' } } },
          { $group: { _id: '$registerIp', users: { $push: { _id: '$_id', name: '$name', avatarUrl: '$avatarUrl', registerIp: '$registerIp', lastLoginIp: '$lastLoginIp', lastLoginAt: '$lastLoginAt', isOnline: '$isOnline', role: '$role', createdAt: '$createdAt' } }, count: { $sum: 1 } } },
          { $match: { count: { $gte: 2 } } },
          { $sort: { count: -1 } },
        ]),
        User.aggregate([
          { $match: { lastLoginIp: { $ne: '' } } },
          { $group: { _id: '$lastLoginIp', users: { $push: { _id: '$_id', name: '$name', avatarUrl: '$avatarUrl', registerIp: '$registerIp', lastLoginIp: '$lastLoginIp', lastLoginAt: '$lastLoginAt', isOnline: '$isOnline', role: '$role', createdAt: '$createdAt' } }, count: { $sum: 1 } } },
          { $match: { count: { $gte: 2 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

      const allGroups = [
        ...registerGroups.map(g => ({ ip: g._id, users: g.users, type: 'registerIp' })),
        ...loginGroups.map(g => ({ ip: g._id, users: g.users, type: 'lastLoginIp' })),
      ];

      res.json({
        groups: allGroups.sort((a, b) => b.users.length - a.users.length),
        totalUsers,
        suspiciousCount: new Set(allGroups.flatMap(g => g.users.map(u => u._id.toString()))).size,
      });
    } catch (err) {
      console.error('[admin]', err);
      res.status(500).json({ error: 'Internal server error' });
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

      const disconnected = await socketRegistry.disconnectUser(userId, '您已被管理员踢出');
      res.json({ ok: true, message: disconnected
        ? `User ${user.name} has been kicked`
        : `User ${user.name} is not online, marked offline` });
      bus.emit('admin:audit', { type: 'kick', actor: req.user.name, target: user.name, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[admin]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
