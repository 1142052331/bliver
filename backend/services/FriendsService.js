const mongoose = require('mongoose');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const { SUPERUSER_NAME } = require('./superuser');
const { isSuperuserName } = require('./authorization');
const AppError = require('../middleware/AppError');
const { getEffectiveFriends, areFriends: policyAreFriends } = require('./SuperuserPolicy');

// ═══════════════════════════════════════════════════════════
//  Read
// ═══════════════════════════════════════════════════════════

/**
 * Get the full friend list for a user, including superuser forced-friend logic.
 */
async function getFriends(userId, userName) {
  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' },
    ],
  }).lean();

  const friendIds = new Set();
  for (const f of friendships) {
    const fid = f.requester.toString() === userId ? f.recipient : f.requester;
    friendIds.add(fid.toString());
  }

  const friends = await User.find({ _id: { $in: [...friendIds].map(id => new mongoose.Types.ObjectId(id)) } })
    .select('name avatarUrl isOnline role')
    .lean();

  return getEffectiveFriends(userId, userName, friends);
}

/**
 * Get all incoming pending friend requests for a user.
 */
async function getPendingRequests(userId) {
  return Friendship.find({ recipient: userId, status: 'pending' })
    .populate('requester', 'name avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
}

// ═══════════════════════════════════════════════════════════
//  Mutations
// ═══════════════════════════════════════════════════════════

/**
 * Send a friend request from requesterId to recipientId.
 * Returns { friendship } on success, or { error, status } on failure.
 */
async function sendRequest(requesterId, recipientId) {
  if (requesterId === recipientId) {
    throw new AppError(400, '不能加自己为好友');
  }

  const recipient = await User.findById(recipientId).lean();
  if (!recipient) throw new AppError(404, '用户不存在');

  if (isSuperuserName(recipient.name)) {
    throw new AppError(400, '管理员已是您的好友，无需申请');
  }

  const existing = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  }).lean();

  if (existing) {
    if (existing.status === 'accepted') throw new AppError(400, '已经是好友');
    if (existing.requester.toString() === requesterId) {
      throw new AppError(400, '你已发送过好友申请，请等待对方通过');
    }
    throw new AppError(400, '对方已向你发送好友申请，请去同意');
  }

  const friendship = await Friendship.create({ requester: requesterId, recipient: recipientId, status: 'pending' });
  return { friendship };
}

/**
 * Accept a pending friend request.
 */
async function acceptRequest(friendshipId, userId) {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship) throw new AppError(404, '申请不存在');
  if (friendship.recipient.toString() !== userId) throw new AppError(403, '无权操作');
  if (friendship.status !== 'pending') throw new AppError(400, '该申请已处理');

  friendship.status = 'accepted';
  await friendship.save();
  return { friendship };
}

/**
 * Reject (delete) a pending friend request.
 */
async function rejectRequest(friendshipId, userId) {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship) throw new AppError(404, '申请不存在');
  if (friendship.recipient.toString() !== userId) throw new AppError(403, '无权操作');
  if (friendship.status !== 'pending') throw new AppError(400, '该申请已处理');

  await friendship.deleteOne();
  return {};
}

/**
 * Remove a bidirectional friendship.
 */
async function removeFriend(userId, targetUserId) {
  const targetUser = await User.findById(targetUserId).lean();
  if (!targetUser) throw new AppError(404, '用户不存在');
  if (isSuperuserName(targetUser.name)) throw new AppError(403, '不能删除管理员好友');

  const result = await Friendship.deleteMany({
    $or: [
      { requester: userId, recipient: targetUserId, status: 'accepted' },
      { requester: targetUserId, recipient: userId, status: 'accepted' },
    ],
  });

  if (result.deletedCount === 0) throw new AppError(404, '好友关系不存在');
  return {};
}

// ═══════════════════════════════════════════════════════════
//  Legacy — used by messages.js and socket/index.js
// ═══════════════════════════════════════════════════════════

module.exports = { getFriends, getPendingRequests, sendRequest, acceptRequest, rejectRequest, removeFriend, areFriends: policyAreFriends };
