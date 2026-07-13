const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Block = require('../models/Block');
const User = require('../models/User');
const AppError = require('../middleware/AppError');
const policy = require('./InteractionPolicy');

const PAGE_SIZE = 20;

function pairKey(a, b) {
  return Conversation.pairKeyFor(a, b);
}

async function createGreeting(senderId, receiverId, content) {
  const decision = await policy.canSendGreeting(senderId, receiverId, { isPublic: true });
  if (!decision.allowed) throw new AppError(403, decision.reason);

  const key = pairKey(senderId, receiverId);
  const conversation = await Conversation.findOneAndUpdate(
    { pairKey: key, $or: [{ state: 'greeting_pending', pendingSenderId: { $ne: senderId } }, { state: 'unlocked' }, { state: { $exists: false } }] },
    { $setOnInsert: { userA: [senderId, receiverId].sort()[0], userB: [senderId, receiverId].sort()[1], pairKey: key }, $set: { state: 'greeting_pending', pendingSenderId: senderId, lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 100) } },
    { upsert: true, new: true },
  );
  const message = await Message.create({ conversationId: conversation._id, senderId, receiverId, content, kind: 'greeting' });
  return { conversation, message };
}

async function replyAndUnlock(conversationId, receiverId, content) {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, state: 'greeting_pending', pendingSenderId: { $ne: receiverId } },
    { $set: { state: 'unlocked', lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 100) } },
    { new: true },
  );
  if (!conversation) throw new AppError(409, 'conversation_not_pending');
  const message = await Message.create({ conversationId, senderId: receiverId, receiverId: conversation.pendingSenderId, content, kind: 'text' });
  return { conversation, message };
}

async function sendText(senderId, receiverId, conversationId, content) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!receiverId && conversation) receiverId = String(conversation.userA) === String(senderId) ? conversation.userB : conversation.userA;
  const decision = await policy.canSendText(senderId, receiverId, { conversationState: conversation?.state });
  if (!decision.allowed) throw new AppError(403, decision.reason);
  const message = await Message.create({ conversationId, senderId, receiverId, content, kind: 'text' });
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 100) } });
  return { conversation, message };
}

async function ignoreGreeting(conversationId, receiverId) {
  const result = await Conversation.updateOne({ _id: conversationId, state: 'greeting_pending', pendingSenderId: { $ne: receiverId } }, { $set: { state: 'greeting_pending', pendingSenderId: null } });
  if (!result.modifiedCount) throw new AppError(409, 'conversation_not_pending');
  return { ok: true };
}

async function hideForUser(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError(404, 'conversation_not_found');
  const field = String(conversation.userA) === String(userId) ? 'hiddenAtA' : 'hiddenAtB';
  conversation[field] = new Date();
  await conversation.save();
  return { ok: true };
}

async function list(userId) {
  return Conversation.find({ $or: [{ userA: userId }, { userB: userId }] }).sort({ lastMessageAt: -1 }).lean();
}

async function history(userId, conversationId, before) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) throw new AppError(404, 'conversation_not_found');
  const targetId = String(conversation.userA) === String(userId) ? conversation.userB : conversation.userA;
  const decision = await policy.canReadConversation(userId, targetId);
  if (!decision.allowed) throw new AppError(403, decision.reason);
  const query = { conversationId };
  if (before) {
    const cursor = await Message.findById(before).select('createdAt').lean();
    if (cursor) query.createdAt = { $lt: cursor.createdAt };
  }
  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean();
  messages.reverse();
  return { messages, hasMore: messages.length === PAGE_SIZE };
}

async function blockUser(blockerId, blockedId) {
  if (String(blockerId) === String(blockedId)) throw new AppError(400, 'cannot_block_self');
  await Block.updateOne({ blockerId, blockedId }, { $setOnInsert: { blockerId, blockedId } }, { upsert: true });
  return { ok: true };
}

async function unblockUser(blockerId, blockedId) {
  await Block.deleteOne({ blockerId, blockedId });
  return { ok: true };
}

async function getMessageSettings(userId) {
  const user = await User.findById(userId).select('allowStrangerMessages').lean();
  if (!user) throw new AppError(404, 'user_not_found');
  return { allowStrangerMessages: user.allowStrangerMessages !== false };
}

async function updateMessageSettings(userId, allowStrangerMessages) {
  const user = await User.findByIdAndUpdate(userId, { $set: { allowStrangerMessages } }, { new: true }).select('allowStrangerMessages').lean();
  if (!user) throw new AppError(404, 'user_not_found');
  return { allowStrangerMessages: user.allowStrangerMessages !== false };
}

module.exports = { createGreeting, replyAndUnlock, sendText, ignoreGreeting, hideForUser, list, history, blockUser, unblockUser, getMessageSettings, updateMessageSettings, PAGE_SIZE };
