const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const AdminBootstrap = require('../models/AdminBootstrap');
const {
  ADMIN_BOOTSTRAP_KEY,
  ADMIN_BOOTSTRAP_LEASE_MS,
} = AdminBootstrap;
const Footprint = require('../models/Footprint');
const Notification = require('../models/Notification');
const { getOnlineUsers, disconnectUser } = require('../socket');
const bus = require('../events/bus');
const auditService = require('./AuditService');
const AppError = require('../middleware/AppError');
const sessionService = require('./SessionService');
const { assertNameClaimAllowed } = require('./UserIdentityPolicy');

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
  const currentUser = await User.findById(userId).select('name role systemIdentity');
  if (!currentUser) throw new AppError(404, 'User not found');

  const set = {};
  if (name) {
    const trimmed = name.trim();
    assertNameClaimAllowed(trimmed, currentUser);
    const exists = await User.exists({ name: trimmed, _id: { $ne: userId } });
    if (exists) throw new AppError(400, 'Name already taken');
    set.name = trimmed;
  }
  if (password) set.password = await bcrypt.hash(password, 10);
  if (Object.keys(set).length === 0) throw new AppError(400, 'Nothing to update');

  const update = { $set: set };
  if (password) update.$inc = { sessionVersion: 1 };
  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after', runValidators: true }).select('-password');
  if (!user) throw new AppError(404, 'User not found');
  // Audit emitted separately by the route handler (needs actorName from req)
  return { user };
}

/**
 * Delete a user and all associated data.
 */
async function deleteUser(userId, actorName) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'admin') throw new AppError(403, 'Cannot delete another admin');

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
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'admin') throw new AppError(403, 'Cannot kick another admin');

  await User.findByIdAndUpdate(userId, {
    $set: { isOnline: false },
    $inc: { sessionVersion: 1 },
  });
  const disconnected = await disconnectUser(userId, '您已被管理员踢出');

  auditService.log({ type: 'kick', actor: actorName, target: user.name });

  return { message: disconnected
    ? `User ${user.name} has been kicked`
    : `User ${user.name} is not online, marked offline` };
}

function matchedCount(result) {
  return result?.matchedCount ?? result?.n ?? result?.nModified ?? 0;
}

async function releaseBootstrapLock(lock) {
  try {
    await AdminBootstrap.deleteOne({
      _id: lock._id,
      key: ADMIN_BOOTSTRAP_KEY,
      ownerToken: lock.ownerToken,
    });
  } catch (error) {
    console.error('[AdminService] bootstrap lock cleanup failed:', error.message);
  }
}

async function rollbackPromotion(user, lock) {
  const result = await User.updateOne(
    { _id: user._id, role: 'admin', sessionVersion: user.sessionVersion },
    {
      $set: { role: 'user' },
      // Keep the version moving forward so a token minted before promotion
      // cannot become valid again after compensation.
      $inc: { sessionVersion: 1 },
    },
  );
  if (matchedCount(result) !== 1) return false;
  await releaseBootstrapLock(lock);
  return true;
}

async function completeBootstrapLock(lock) {
  const completedAt = new Date();
  const result = await AdminBootstrap.updateOne(
    {
      _id: lock._id,
      key: ADMIN_BOOTSTRAP_KEY,
      state: 'pending',
      ownerToken: lock.ownerToken,
    },
    {
      $set: {
        state: 'completed',
        completedAt,
        leaseExpiresAt: completedAt,
      },
    },
  );
  if (matchedCount(result) !== 1) {
    throw new Error('Admin bootstrap lock completion failed');
  }
}

async function acquireBootstrapLock(userId) {
  const now = new Date();
  const ownerToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + ADMIN_BOOTSTRAP_LEASE_MS);
  const lockData = {
    _id: ADMIN_BOOTSTRAP_KEY,
    key: ADMIN_BOOTSTRAP_KEY,
    userId,
    ownerToken,
    leaseExpiresAt,
  };

  try {
    return await AdminBootstrap.create(lockData);
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const reclaimed = await AdminBootstrap.findOneAndUpdate(
      {
        _id: ADMIN_BOOTSTRAP_KEY,
        key: ADMIN_BOOTSTRAP_KEY,
        state: 'pending',
        leaseExpiresAt: { $lte: now },
      },
      { $set: { userId, ownerToken, leaseExpiresAt } },
      { returnDocument: 'after' },
    );
    if (reclaimed) return reclaimed;
    throw new AppError(409, 'Administrator already configured');
  }
}

async function setupAdmin(userId, secret) {
  const adminSecret = process.env.ADMIN_SETUP_SECRET;
  if (!adminSecret) throw new AppError(500, 'Not configured');
  const suppliedDigest = crypto.createHash('sha256').update(String(secret || '')).digest();
  const expectedDigest = crypto.createHash('sha256').update(adminSecret).digest();
  if (!crypto.timingSafeEqual(suppliedDigest, expectedDigest)) {
    throw new AppError(403, 'Wrong secret');
  }

  if (await User.exists({ role: 'admin' })) {
    throw new AppError(409, 'Administrator already configured');
  }

  let lock;
  try {
    lock = await acquireBootstrapLock(userId);
  } catch (error) {
    throw error;
  }

  let user;
  try {
    if (await User.exists({ role: 'admin' })) {
      throw new AppError(409, 'Administrator already configured');
    }

    user = await User.findOneAndUpdate({ _id: userId, role: { $ne: 'admin' } }, {
      $set: { role: 'admin' },
      $inc: { sessionVersion: 1 },
    }, { returnDocument: 'after' });
    if (!user) {
      const existing = await User.findById(userId).select('role');
      if (existing?.role === 'admin') {
        throw new AppError(409, 'Administrator already configured');
      }
      throw new AppError(404, 'User not found');
    }
  } catch (error) {
    await releaseBootstrapLock(lock);
    throw error;
  }

  let token;
  try {
    token = sessionService.issueToken(user);
    await completeBootstrapLock(lock);
  } catch (error) {
    let rolledBack = false;
    try {
      rolledBack = await rollbackPromotion(user, lock);
    } catch (rollbackError) {
      console.error('[AdminService] bootstrap promotion rollback failed:', rollbackError.message);
    }
    if (rolledBack) throw error;

    // The role update is durable but compensation lost its race. Preserve
    // the valid admin state and make a best-effort second lock completion.
    try {
      await completeBootstrapLock(lock);
    } catch (completionError) {
      console.error('[AdminService] bootstrap lock finalization failed:', completionError.message);
    }
    if (!token) token = sessionService.issueToken(user);
  }

  try {
    await auditService.log({ type: 'admin_setup', actor: user.name, target: user.name });
  } catch (error) {
    console.error('[AdminService] admin setup audit failed:', error.message);
  }

  return { message: 'Admin role granted', token };
}

module.exports = { listOnlineUsers, listUsers, updateUser, deleteUser, detectClones, kickUser, setupAdmin };
