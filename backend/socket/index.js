const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const { JWT_SECRET } = require('../middleware/auth');
const { sendPushToUser } = require('../routes/push');

const onlineCount = async () => {
  const count = await User.countDocuments({ isOnline: true });
  return count;
};

/** Get all accepted friend IDs for a user (DB friends only, 阿森 handled separately) */
async function getFriendIds(userId) {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).lean();

  const ids = new Set();
  for (const f of friendships) {
    const fid = f.requester.toString() === userId.toString()
      ? f.recipient.toString()
      : f.requester.toString();
    ids.add(fid);
  }
  return ids;
}

/** Check if two users are friends (respects admin/阿森 forced-friend rule) */
async function areFriends(userId, targetId) {
  if (userId.toString() === targetId.toString()) return false;
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

const setupSocket = (io) => {
  const pendingOffline = new Map();

  // ── JWT authentication middleware — runs before every connection ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.join(decoded.id); // ← room binding: socket.join(userId)
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, 'userId:', socket.userId);

    // ── Single-session enforcement — kick old sockets for this userId (always enforced) ──
    (async () => {
      try {
        const userId = socket.userId;
        const existing = await io.in(userId).fetchSockets();
        for (const s of existing) {
          if (s.id !== socket.id) {
            s.emit('force_logout', { reason: '您的账号在其他设备登录了' });
            s.disconnect(true);
          }
        }
      } catch (err) {
        console.error('single-session enforcement error:', err.message);
      }
    })();

    // ── user:online — set online + broadcast to friends ──
    socket.on('user:online', async () => {
      try {
        const userId = socket.userId;

        // Cancel any pending offline for this user (mobile bg/fg)
        const pending = pendingOffline.get(userId);
        if (pending) {
          clearTimeout(pending);
          pendingOffline.delete(userId);
        }

        // Check if this is the user's first connection (multi-tab support)
        const userSockets = await io.in(userId).fetchSockets();
        const isFirstConnection = userSockets.length === 1;

        const user = await User.findByIdAndUpdate(userId, { isOnline: true }, { returnDocument: 'after' }).select('name avatarUrl');
        const count = await onlineCount();
        io.emit('online:count', { count });

        if (!user) return;

        // Broadcast to all connected clients (legacy)
        socket.broadcast.emit('user_online', { userId, name: user.name, avatarUrl: user.avatarUrl });

        // ── 好友精准广播（仅第一端连接时触发）──
        if (!isFirstConnection) return;

        if (user.name === '阿森') {
          socket.broadcast.emit('friend:online', {
            userId, name: user.name, avatarUrl: user.avatarUrl,
          });
        } else {
          const friendIds = await getFriendIds(userId);
          for (const fid of friendIds) {
            io.to(fid).emit('friend:online', {
              userId, name: user.name, avatarUrl: user.avatarUrl,
            });
          }
          const asen = await User.findOne({ name: '阿森', isOnline: true }).select('_id').lean();
          if (asen && !friendIds.has(asen._id.toString())) {
            io.to(asen._id.toString()).emit('friend:online', {
              userId, name: user.name, avatarUrl: user.avatarUrl,
            });
          }
        }
      } catch (err) {
        console.error('user:online error:', err.message);
      }
    });

    // ── send_message ──────────────────────────────────────
    socket.on('send_message', async ({ receiverId, content, tempId }) => {
      try {
        const senderId = socket.userId;
        if (!content || !receiverId) return;

        // Friendship gate
        const ok = await areFriends(senderId, receiverId);
        if (!ok) {
          socket.emit('message:error', { tempId, error: '不是好友，无法发送消息' });
          return;
        }

        // Persist to DB (isRead defaults to false)
        const msg = await Message.create({
          senderId,
          receiverId,
          content: content.slice(0, 1000),
        });

        const sender = await User.findById(senderId).select('name').lean();
        const msgWithSender = { ...msg.toObject(), _senderName: sender?.name };

        // Confirm back to sender with real _id
        socket.emit('message:sent', { tempId, message: msgWithSender });

        // Deliver to receiver if online, otherwise stays isRead:false in DB
        io.to(receiverId).emit('receive_message', { message: msgWithSender });

        // Send push notification if receiver is offline
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
      } catch (err) {
        console.error('send_message error:', err.message);
        socket.emit('message:error', { tempId, error: '发送失败，请重试' });
      }
    });

    // ── typing / stop_typing ──────────────────────────────
    socket.on('typing', async ({ receiverId }) => {
      try {
        const senderId = socket.userId;
        const ok = await areFriends(senderId, receiverId);
        if (!ok) return;
        const sender = await User.findById(senderId).select('name').lean();
        io.to(receiverId).emit('typing', { senderId, senderName: sender?.name || 'Unknown' });
      } catch (err) {
        console.error('typing error:', err.message);
      }
    });

    socket.on('stop_typing', async ({ receiverId }) => {
      try {
        const senderId = socket.userId;
        const ok = await areFriends(senderId, receiverId);
        if (!ok) return;
        io.to(receiverId).emit('stop_typing', { senderId });
      } catch (err) {
        console.error('stop_typing error:', err.message);
      }
    });

    // ── disconnect — delayed offline with friend broadcast ──
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (!socket.userId) return;

      const uid = socket.userId.toString();
      const timer = setTimeout(async () => {
        pendingOffline.delete(uid);

        const remaining = await io.fetchSockets();
        const hasOther = remaining.some(
          (s) => s.id !== socket.id && s.userId === socket.userId
        );

        if (hasOther) return; // Still connected from another tab/device

        const user = await User.findByIdAndUpdate(socket.userId, { isOnline: false }).select('name').lean();
        const count = await onlineCount();
        io.emit('online:count', { count });

        if (!user) return;

        io.emit('user_offline', { userId: socket.userId, name: user.name });

        // ── 好友离线广播 ──────────────────────────
        if (user.name === '阿森') {
          io.emit('friend:offline', { userId: socket.userId, name: user.name });
        } else {
          const friendIds = await getFriendIds(socket.userId);
          for (const fid of friendIds) {
            io.to(fid).emit('friend:offline', { userId: socket.userId, name: user.name });
          }
          // Force-notify 阿森
          const asen = await User.findOne({ name: '阿森', isOnline: true }).select('_id').lean();
          if (asen && !friendIds.has(asen._id.toString())) {
            io.to(asen._id.toString()).emit('friend:offline', { userId: socket.userId, name: user.name });
          }
        }
      }, 5000);

      pendingOffline.set(uid, timer);
    });
  });
};

module.exports = setupSocket;
