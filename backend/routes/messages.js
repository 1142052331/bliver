const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');

const PAGE_SIZE = 20;

/** Check if two users are friends (or admin/阿森 forced-friend rule) */
async function areFriends(userId, targetId) {
  const target = await User.findById(targetId).select('name').lean();
  if (!target) return false;

  // 阿森 → everyone; everyone → 阿森
  if (target.name === '阿森') return true;

  const sender = await User.findById(userId).select('name role').lean();
  if (sender && (sender.role === 'admin' || sender.name === '阿森')) return true;

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: targetId },
      { requester: targetId, recipient: userId },
    ],
  }).lean();

  return !!friendship;
}

module.exports = () => {
  const router = express.Router();

  // GET /api/messages/:friendId?before=<messageId> — paginated chat history
  router.get('/messages/:friendId', auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const friendId = req.params.friendId;

      const isFriend = await areFriends(userId, friendId);
      if (!isFriend) {
        return res.status(403).json({ error: '不是好友，无法查看聊天记录' });
      }

      const query = {
        $or: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      };

      // Cursor-based pagination: fetch messages before this ID
      if (req.query.before) {
        const cursorMsg = await Message.findById(req.query.before).select('createdAt').lean();
        if (cursorMsg) {
          query.createdAt = { $lt: cursorMsg.createdAt };
        }
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
        // Reflect read status in the response
        for (const m of messages) {
          if (unreadIds.some(id => id.equals(m._id))) {
            m.isRead = true;
          }
        }
      }

      // Return in chronological order (oldest first) for chat display
      messages.reverse();

      const hasMore = messages.length === PAGE_SIZE;

      res.json({ messages, hasMore });
    } catch (err) {
      console.error('[messages]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/messages/:friendId — send a message
  router.post('/messages/:friendId', auth, contentLimiter, async (req, res) => {
    try {
      const userId = req.user.id;
      const friendId = req.params.friendId;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: '消息不能为空' });
      }
      if (content.length > 1000) {
        return res.status(400).json({ error: '消息不能超过1000字' });
      }

      const isFriend = await areFriends(userId, friendId);
      if (!isFriend) {
        return res.status(403).json({ error: '不是好友，无法发送消息' });
      }

      const msg = await Message.create({
        senderId: userId,
        receiverId: friendId,
        content: content.trim(),
      });

      res.status(201).json({ message: msg });
    } catch (err) {
      console.error('[messages]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
