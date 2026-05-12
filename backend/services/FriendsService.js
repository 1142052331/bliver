const mongoose = require('mongoose');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const { SUPERUSER_NAME, isSuperuserName } = require('./superuser');

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

  if (!isSuperuserName(userName)) {
    // Inject superuser as forced friend for everyone
    const asen = await User.findOne({ name: SUPERUSER_NAME }).select('name avatarUrl isOnline role').lean();
    if (asen) {
      const asenId = asen._id.toString();
      if (!friends.some(f => f._id.toString() === asenId)) {
        friends.unshift(asen);
      }
    }
  } else {
    // Superuser: inject users with chat history
    const sentIds = await Message.distinct('receiverId', { senderId: userId });
    const recvIds = await Message.distinct('senderId', { receiverId: userId });
    const chatterIdSet = new Set([...sentIds.map(String), ...recvIds.map(String)]);
    friends.forEach(f => chatterIdSet.delete(f._id.toString()));

    if (chatterIdSet.size > 0) {
      const chatterIds = [...chatterIdSet].map(id => new mongoose.Types.ObjectId(id));
      const chatters = await User.find({ _id: { $in: chatterIds } })
        .select('name avatarUrl isOnline role').lean();
      friends.unshift(...chatters);
    }
  }

  return friends;
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
    return { error: '不能加自己为好友', status: 400 };
  }

  const recipient = await User.findById(recipientId).lean();
  if (!recipient) return { error: '用户不存在', status: 404 };

  if (isSuperuserName(recipient.name)) {
    return { error: '管理员已是您的好友，无需申请', status: 400 };
  }

  const existing = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  }).lean();

  if (existing) {
    if (existing.status === 'accepted') return { error: '已经是好友', status: 400 };
    if (existing.requester.toString() === requesterId) {
      return { error: '你已发送过好友申请，请等待对方通过', status: 400 };
    }
    return { error: '对方已向你发送好友申请，请去同意', status: 400 };
  }

  const friendship = await Friendship.create({ requester: requesterId, recipient: recipientId, status: 'pending' });
  return { friendship };
}

/**
 * Accept a pending friend request.
 */
async function acceptRequest(friendshipId, userId) {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship) return { error: '申请不存在', status: 404 };
  if (friendship.recipient.toString() !== userId) return { error: '无权操作', status: 403 };
  if (friendship.status !== 'pending') return { error: '该申请已处理', status: 400 };

  friendship.status = 'accepted';
  await friendship.save();
  return { friendship };
}

/**
 * Reject (delete) a pending friend request.
 */
async function rejectRequest(friendshipId, userId) {
  const friendship = await Friendship.findById(friendshipId);
  if (!friendship) return { error: '申请不存在', status: 404 };
  if (friendship.recipient.toString() !== userId) return { error: '无权操作', status: 403 };
  if (friendship.status !== 'pending') return { error: '该申请已处理', status: 400 };

  await friendship.deleteOne();
  return {};
}

/**
 * Remove a bidirectional friendship.
 */
async function removeFriend(userId, targetUserId) {
  const targetUser = await User.findById(targetUserId).lean();
  if (!targetUser) return { error: '用户不存在', status: 404 };
  if (isSuperuserName(targetUser.name)) return { error: '不能删除管理员好友', status: 403 };

  const result = await Friendship.deleteMany({
    $or: [
      { requester: userId, recipient: targetUserId, status: 'accepted' },
      { requester: targetUserId, recipient: userId, status: 'accepted' },
    ],
  });

  if (result.deletedCount === 0) return { error: '好友关系不存在', status: 404 };
  return {};
}

// ═══════════════════════════════════════════════════════════
//  Legacy — used by messages.js and socket/index.js
// ═══════════════════════════════════════════════════════════

/**
 * Check if two users are friends (respects superuser forced-friend rule).
 */
async function areFriends(userId, targetId) {
  if (userId.toString() === targetId.toString()) return false;

  const target = await User.findById(targetId).select('name').lean();
  if (!target) return false;
  if (isSuperuserName(target.name)) return true;

  const sender = await User.findById(userId).select('name role').lean();
  if (sender && (sender.role === 'admin' || isSuperuserName(sender.name))) return true;

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: targetId },
      { requester: targetId, recipient: userId },
    ],
  }).lean();

  return !!friendship;
}

module.exports = { getFriends, getPendingRequests, sendRequest, acceptRequest, rejectRequest, removeFriend, areFriends };
