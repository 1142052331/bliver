const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { isSuperuserName } = require('./superuser');

/**
 * Check if two users are friends.
 * Respects the superuser forced-friend rule: superuser is friends with everyone.
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

module.exports = { areFriends };
