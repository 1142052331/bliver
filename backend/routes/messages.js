const express = require('express');
const Message = require('../models/Message');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const { areFriends } = require('../services/friendship');
const validate = require('../middleware/validate');
const { message: messageSchema } = require('../validators/schemas');

const PAGE_SIZE = 20;

module.exports = () => {
  const router = express.Router();

  // GET /api/messages/:friendId?before=<messageId> — paginated chat history
  router.get('/messages/:friendId', auth, async (req, res, next) => {
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
      next(err);
    }
  });

  // POST /api/messages/:friendId — send a message
  router.post('/messages/:friendId', auth, contentLimiter, validate(messageSchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const friendId = req.params.friendId;
      const { content } = req.body;

      const isFriend = await areFriends(userId, friendId);
      if (!isFriend) {
        return res.status(403).json({ error: '不是好友，无法发送消息' });
      }

      const msg = await Message.create({
        senderId: userId,
        receiverId: friendId,
        content,
      });

      res.status(201).json({ message: msg });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
