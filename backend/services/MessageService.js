const Message = require('../models/Message');
const User = require('../models/User');
const { areFriends } = require('./FriendsService');
const { sendPushToUser } = require('./push');

const PAGE_SIZE = 20;

/**
 * Get paginated chat history between two users.
 * Returns messages in chronological order (oldest first).
 */
async function getHistory(userId, friendId, before) {
  const query = {
    $or: [
      { senderId: userId, receiverId: friendId },
      { senderId: friendId, receiverId: userId },
    ],
  };

  if (before) {
    const cursorMsg = await Message.findById(before).select('createdAt').lean();
    if (cursorMsg) query.createdAt = { $lt: cursorMsg.createdAt };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(PAGE_SIZE)
    .lean();

  // Mark incoming messages as read
  const unreadIds = messages
    .filter(m => m.receiverId.toString() === userId && !m.isRead)
    .map(m => m._id);

  if (unreadIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: unreadIds } },
      { $set: { isRead: true } }
    );
    for (const m of messages) {
      if (unreadIds.some(id => id.equals(m._id))) m.isRead = true;
    }
  }

  messages.reverse();

  return { messages, hasMore: messages.length === PAGE_SIZE };
}

/**
 * Create and persist a message (HTTP route).
 */
async function send(userId, friendId, content) {
  const ok = await areFriends(userId, friendId);
  if (!ok) return { error: '不是好友，无法发送消息', status: 403 };

  const msg = await Message.create({ senderId: userId, receiverId: friendId, content });
  return { message: msg };
}

/**
 * Create, enrich, and deliver a message via socket (real-time).
 * Returns enriched message + receiverOnline flag.
 */
async function socketSend(senderId, receiverId, content, io) {
  const msg = await Message.create({
    senderId,
    receiverId,
    content: content.slice(0, 1000),
  });

  const sender = await User.findById(senderId).select('name').lean();
  const msgWithSender = { ...msg.toObject(), _senderName: sender?.name };

  const allSockets = await io.fetchSockets();
  const receiverOnline = allSockets.some(s => s.userId === receiverId);

  if (!receiverOnline) {
    sendPushToUser(receiverId, {
      title: sender?.name || '新私信',
      body: content.slice(0, 100),
      icon: '/favicon.svg',
      data: { url: '/' },
    });
  }

  return { msgWithSender, receiverOnline };
}

/**
 * Check friendship and return sender info (for socket typing events).
 */
async function getTypingSender(senderId, receiverId) {
  const ok = await areFriends(senderId, receiverId);
  if (!ok) return null;
  const sender = await User.findById(senderId).select('name').lean();
  return sender;
}

module.exports = { getHistory, send, socketSend, getTypingSender, PAGE_SIZE };
