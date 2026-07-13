const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Block = require('../models/Block');

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

async function isBlocked(actorId, targetId) {
  if (!actorId || !targetId || sameId(actorId, targetId)) return false;
  const block = await Block.findOne({
    $or: [
      { blockerId: actorId, blockedId: targetId },
      { blockerId: targetId, blockedId: actorId },
    ],
  }).lean();
  return Boolean(block);
}

async function areFriends(actorId, targetId) {
  if (!actorId || !targetId || sameId(actorId, targetId)) return false;
  const friendship = await Friendship.findOne({
    $or: [
      { requester: actorId, recipient: targetId, status: 'accepted' },
      { requester: targetId, recipient: actorId, status: 'accepted' },
    ],
  }).lean();
  return Boolean(friendship);
}

async function targetUser(targetId) {
  return User.findById(targetId).select('allowStrangerMessages role').lean();
}

async function baseDecision(actorId, targetId) {
  if (!actorId || !targetId) return { allowed: false, reason: 'invalid_target' };
  if (sameId(actorId, targetId)) return { allowed: true, reason: 'self' };
  if (await isBlocked(actorId, targetId)) return { allowed: false, reason: 'blocked' };
  return null;
}

async function canViewProfile(actorId, targetId) {
  const blocked = await baseDecision(actorId, targetId);
  return blocked || { allowed: true, reason: 'visible' };
}

async function canViewContent(actorId, targetId, { isPublic = false } = {}) {
  const blocked = await baseDecision(actorId, targetId);
  if (blocked) return blocked;
  if (sameId(actorId, targetId)) return { allowed: true, reason: 'self' };
  if (await areFriends(actorId, targetId)) return { allowed: true, reason: 'friend' };
  return isPublic ? { allowed: true, reason: 'public' } : { allowed: false, reason: 'private' };
}

async function canSendGreeting(actorId, targetId, { isPublic = false } = {}) {
  const blocked = await baseDecision(actorId, targetId);
  if (blocked) return blocked;
  if (!isPublic) return { allowed: false, reason: 'content_not_public' };
  if (await areFriends(actorId, targetId)) return { allowed: false, reason: 'already_friends' };
  const user = await targetUser(targetId);
  if (!user) return { allowed: false, reason: 'target_not_found' };
  if (user.allowStrangerMessages === false) return { allowed: false, reason: 'stranger_messages_disabled' };
  return { allowed: true, reason: 'stranger_greeting' };
}

async function canSendText(actorId, targetId, { conversationState = null } = {}) {
  const blocked = await baseDecision(actorId, targetId);
  if (blocked) return blocked;
  if (await areFriends(actorId, targetId)) return { allowed: true, reason: 'friend' };
  if (conversationState === 'unlocked') return { allowed: true, reason: 'unlocked' };
  return { allowed: false, reason: 'conversation_locked' };
}

async function canReadConversation(actorId, targetId) {
  const blocked = await baseDecision(actorId, targetId);
  return blocked || { allowed: true, reason: 'visible' };
}

async function canUnblock(actorId, targetId) {
  if (!actorId || !targetId || sameId(actorId, targetId)) return { allowed: false, reason: 'invalid_target' };
  return { allowed: true, reason: 'owner_action' };
}

module.exports = {
  canViewProfile,
  canViewContent,
  canSendGreeting,
  canSendText,
  canReadConversation,
  canUnblock,
  isBlocked,
  areFriends,
};
