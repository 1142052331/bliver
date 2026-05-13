const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const Notification = require('../models/Notification');
const { getOnlineUsers, disconnectUser } = require('../socket');
const bus = require('../events/bus');
const auditService = require('./AuditService');

/**
 * Enrich raw socket online data with user names/avatars.
 */
async function listOnlineUsers() {
  const online = await getOnlineUsers();
  const userIds = online.map((o) => o.userId);
  const users = await User.find({ _id: { $in: userIds } }).select('name avatarUrl registerIp lastLoginIp');
  const userMap = {};
  users.forEach((u) => { userMap[u._id.toString()] = u; });

  return online.map((o) => {
    const u = userMap[o.userId.toString()] || {};
    return { ...o, name: u.name || 'Unknown', avatarUrl: u.avatarUrl || '', registerIp: u.registerIp || '', lastLoginIp: u.lastLoginIp || '' };
  });
}

/**
 * List all registered users with footprint count.
 */
async function listUsers() {
  const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
  const userIds = users.map((u) => u._id);

  const counts = await Footprint.aggregate([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

  return users.map((u) => ({ ...u, footprintCount: countMap[u._id.toString()] || 0 }));
}

/**
 * Update a user's name and/or password.
 */
async function updateUser(userId, { name, password }) {
  const update = {};
  if (name) update.name = name;
  if (password) update.password = await bcrypt.hash(password, 10);
  if (Object.keys(update).length === 0) return { error: 'Nothing to update', status: 400 };

  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after', runValidators: true }).select('-password');
  if (!user) return { error: 'User not found', status: 404 };
  // Audit emitted separately by the route handler (needs actorName from req)
  return { user };
}

/**
 * Delete a user and all associated data.
 */
async function deleteUser(userId, actorName) {
  const user = await User.findById(userId);
  if (!user) return { error: 'User not found', status: 404 };
  if (user.role === 'admin') return { error: 'Cannot delete another admin', status: 403 };

  await Promise.all([
    User.findByIdAndDelete(userId),
    Footprint.deleteMany({ userId }),
    Notification.deleteMany({ recipientId: userId }),
    User.updateMany({ 'profileReactions.senderId': userId }, { $pull: { profileReactions: { senderId: userId } } }),
  ]);

  await disconnectUser(userId, '您的账户已被管理员删除');

  auditService.log({ type: 'delete', actor: actorName, target: user.name });

  return { message: 'User and all associated data deleted', userName: user.name };
}

/**
 * Detect clone accounts by grouping users who share registerIp or lastLoginIp.
 */
async function detectClones() {
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

  return {
    groups: allGroups.sort((a, b) => b.users.length - a.users.length),
    totalUsers,
    suspiciousCount: new Set(allGroups.flatMap(g => g.users.map(u => u._id.toString()))).size,
  };
}

/**
 * Force-logout a user via socket disconnect + DB mark offline.
 */
async function kickUser(userId, actorName) {
  const user = await User.findById(userId);
  if (!user) return { error: 'User not found', status: 404 };
  if (user.role === 'admin') return { error: 'Cannot kick another admin', status: 403 };

  await User.findByIdAndUpdate(userId, { isOnline: false });
  const disconnected = await disconnectUser(userId, '您已被管理员踢出');

  auditService.log({ type: 'kick', actor: actorName, target: user.name });

  return { message: disconnected
    ? `User ${user.name} has been kicked`
    : `User ${user.name} is not online, marked offline` };
}

async function setupAdmin(userId, secret) {
  const adminSecret = process.env.ADMIN_SETUP_SECRET;
  if (!adminSecret) return { error: 'Not configured', status: 500 };
  if (secret !== adminSecret) return { error: 'Wrong secret', status: 403 };

  await User.findByIdAndUpdate(userId, { role: 'admin' });
  return { message: 'Admin role granted' };
}

module.exports = { listOnlineUsers, listUsers, updateUser, deleteUser, detectClones, kickUser, setupAdmin };
