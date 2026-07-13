const mongoose = require('mongoose');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const { FOUNDER_SYSTEM_IDENTITY, isFounder } = require('./UserIdentityPolicy');

/**
 * Inject superuser (or chat-history users for superuser) into a friend list.
 * Replaces duplicated logic in FriendsService.getFriends().
 */
async function getEffectiveFriends(userId, _userName, friends) {
  const user = await User.findById(userId).select('systemIdentity').lean();
  if (!isFounder(user)) {
    const asen = await User.findOne({ systemIdentity: FOUNDER_SYSTEM_IDENTITY })
      .select('name avatarUrl isOnline role').lean();
    if (asen) {
      const asenId = asen._id.toString();
      if (!friends.some(f => f._id.toString() === asenId)) {
        friends.unshift(asen);
      }
    }
  } else {
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
 * Get broadcast targets for online/offline events.
 * Returns { mode: 'all' } for superuser, or { mode: 'friends+superuser', friendIds, superuserId }.
 */
async function getBroadcastTargets(userId, _userName) {
  const user = await User.findById(userId).select('systemIdentity').lean();
  if (isFounder(user)) {
    return { mode: 'all' };
  }
  const friendIds = await getFriendIds(userId);
  const asen = await User.findOne({ systemIdentity: FOUNDER_SYSTEM_IDENTITY, isOnline: true })
    .select('_id').lean();
  return { mode: 'friends+superuser', friendIds, superuserId: asen?._id };
}

/**
 * Get a Set of friend user IDs (accepted friendships only).
 */
async function getFriendIds(userId) {
  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' },
    ],
  }).lean();

  const ids = new Set();
  for (const f of friendships) {
    const fid = f.requester.toString() === userId ? f.recipient : f.requester;
    ids.add(fid.toString());
  }
  return ids;
}

/**
 * Check if two users are friends (respects superuser forced-friend rule).
 */
async function areFriends(userId, targetId) {
  if (userId.toString() === targetId.toString()) return false;

  const target = await User.findById(targetId).select('systemIdentity').lean();
  if (!target) return false;
  if (isFounder(target)) return true;

  const sender = await User.findById(userId).select('role systemIdentity').lean();
  if (sender && (
    sender.role === 'admin'
    || isFounder(sender)
  )) return true;

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: targetId },
      { requester: targetId, recipient: userId },
    ],
  }).lean();

  return !!friendship;
}

module.exports = { getEffectiveFriends, getBroadcastTargets, getFriendIds, areFriends };
