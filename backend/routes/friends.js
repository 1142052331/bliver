const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { auth } = require('../middleware/auth');
const { SUPERUSER_NAME, isSuperuserName } = require('../services/superuser');

module.exports = () => {
  const router = express.Router();

  // GET /api/friends — friend list (injects superuser as forced friend)
  router.get('/friends', auth, async (req, res) => {
    try {
      const userId = req.user.id;

      // Find all accepted friendships involving current user (either direction)
      const friendships = await Friendship.find({
        $or: [
          { requester: userId, status: 'accepted' },
          { recipient: userId, status: 'accepted' },
        ],
      }).lean();

      // Collect friend IDs
      const friendIds = new Set();
      for (const f of friendships) {
        const fid = f.requester.toString() === userId ? f.recipient : f.requester;
        friendIds.add(fid.toString());
      }

      // Fetch friend user objects
      const friends = await User.find({ _id: { $in: [...friendIds].map(id => new mongoose.Types.ObjectId(id)) } })
        .select('name avatarUrl isOnline role')
        .lean();

      // Inject superuser unless current user IS superuser
      if (!isSuperuserName(req.user.name)) {
        const asen = await User.findOne({ name: SUPERUSER_NAME }).select('name avatarUrl isOnline role').lean();
        if (asen) {
          const asenId = asen._id.toString();
          const alreadyExists = friends.some(f => f._id.toString() === asenId);
          if (!alreadyExists) {
            friends.unshift(asen);
          }
        }
      } else {
        // Superuser: inject users with chat history (forced-friend symmetry)
        const Message = require('../models/Message');
        const sentIds = await Message.distinct('receiverId', { senderId: userId });
        const recvIds = await Message.distinct('senderId', { receiverId: userId });
        const chatterIdSet = new Set([...sentIds.map(String), ...recvIds.map(String)]);
        // Remove IDs already in friends list
        friends.forEach(f => chatterIdSet.delete(f._id.toString()));

        if (chatterIdSet.size > 0) {
          const chatterIds = [...chatterIdSet].map(id => new mongoose.Types.ObjectId(id));
          const chatters = await User.find({ _id: { $in: chatterIds } })
            .select('name avatarUrl isOnline role').lean();
          // Prepend chatters — they appear above any explicit friends
          friends.unshift(...chatters);
        }
      }

      res.json({ friends });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/friends/requests — incoming pending requests
  router.get('/friends/requests', auth, async (req, res) => {
    try {
      const docs = await Friendship.find({ recipient: req.user.id, status: 'pending' })
        .populate('requester', 'name avatarUrl')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ requests: docs });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/friends/request/:userId — send friend request
  router.post('/friends/request/:userId', auth, async (req, res) => {
    try {
      const requesterId = req.user.id;
      const recipientId = req.params.userId;

      if (requesterId === recipientId) {
        return res.status(400).json({ error: '不能加自己为好友' });
      }

      // Check target exists
      const recipient = await User.findById(recipientId).lean();
      if (!recipient) return res.status(404).json({ error: '用户不存在' });

      // Superuser is already a forced friend — no request needed
      if (isSuperuserName(recipient.name)) {
        return res.status(400).json({ error: '管理员已是您的好友，无需申请' });
      }

      // Mutual exclusivity: check both directions for any existing request
      const existing = await Friendship.findOne({
        $or: [
          { requester: requesterId, recipient: recipientId },
          { requester: recipientId, recipient: requesterId },
        ],
      }).lean();

      if (existing) {
        if (existing.status === 'accepted') {
          return res.status(400).json({ error: '已经是好友' });
        }
        if (existing.requester.toString() === requesterId) {
          return res.status(400).json({ error: '你已发送过好友申请，请等待对方通过' });
        }
        return res.status(400).json({ error: '对方已向你发送好友申请，请去同意' });
      }

      const friendship = await Friendship.create({
        requester: requesterId,
        recipient: recipientId,
        status: 'pending',
      });

      res.status(201).json({ friendship });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/friends/accept/:friendshipId — accept a pending request
  router.post('/friends/accept/:friendshipId', auth, async (req, res) => {
    try {
      const friendship = await Friendship.findById(req.params.friendshipId);
      if (!friendship) return res.status(404).json({ error: '申请不存在' });

      // Only the recipient can accept
      if (friendship.recipient.toString() !== req.user.id) {
        return res.status(403).json({ error: '无权操作' });
      }

      if (friendship.status !== 'pending') {
        return res.status(400).json({ error: '该申请已处理' });
      }

      friendship.status = 'accepted';
      await friendship.save();

      res.json({ friendship });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/friends/reject/:friendshipId — reject a pending request
  router.post('/friends/reject/:friendshipId', auth, async (req, res) => {
    try {
      const friendship = await Friendship.findById(req.params.friendshipId);
      if (!friendship) return res.status(404).json({ error: '申请不存在' });

      // Only the recipient can reject
      if (friendship.recipient.toString() !== req.user.id) {
        return res.status(403).json({ error: '无权操作' });
      }

      if (friendship.status !== 'pending') {
        return res.status(400).json({ error: '该申请已处理' });
      }

      await friendship.deleteOne();

      res.json({ ok: true });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/friends/:userId — remove friend
  router.delete('/friends/:userId', auth, async (req, res) => {
    try {
      const targetUser = await User.findById(req.params.userId).lean();
      if (!targetUser) return res.status(404).json({ error: '用户不存在' });

      // Cannot delete superuser
      if (isSuperuserName(targetUser.name)) {
        return res.status(403).json({ error: '不能删除管理员好友' });
      }

      const userId = req.user.id;
      const targetId = req.params.userId;

      // Remove friendship in both directions
      const result = await Friendship.deleteMany({
        $or: [
          { requester: userId, recipient: targetId, status: 'accepted' },
          { requester: targetId, recipient: userId, status: 'accepted' },
        ],
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: '好友关系不存在' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[friends]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
