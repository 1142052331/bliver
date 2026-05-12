const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { JWT_SECRET } = require('../middleware/auth');
const { areFriends } = require('../services/FriendsService');
const messageService = require('../services/MessageService');
const { SUPERUSER_NAME, isSuperuserName } = require('../services/superuser');
const bus = require('../events/bus');

const onlineCount = async () => {
  const count = await User.countDocuments({ isOnline: true });
  return count;
};

/** Get all accepted friend IDs for a user (DB friends only, superuser handled separately) */
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

function _setupSocket(io) {
  // ── Broadcast events: relay domain events to all connected sockets ──
  const broadcast = ['footprint:new', 'footprint:updated', 'footprint:deleted', 'profile:updated', 'admin:audit'];
  for (const event of broadcast) {
    bus.on(event, (data) => {
      io.emit(event, data);
    });
  }
  // Notification delivery is handled directly by NotificationService.notify()
  // (injecting io at init time). No bus hop needed for point-to-point delivery.

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

    // ── Update lastLoginIp on every socket connection ──
    (async () => {
      try {
        const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || socket.handshake.address
          || 'unknown';
        const user = await User.findByIdAndUpdate(socket.userId, { lastLoginIp: ip, lastLoginAt: new Date() }, { returnDocument: 'after' }).select('name').lean();
        if (user) {
          io.emit('admin:audit', { type: 'connect', user: user.name, ip, timestamp: new Date().toISOString() });
        }
      } catch (err) {
        console.error('IP capture on connect error:', err.message);
      }
    })();

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

        if (isSuperuserName(user.name)) {
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
          const asen = await User.findOne({ name: SUPERUSER_NAME, isOnline: true }).select('_id').lean();
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
        if (!content || !receiverId) return;
        const result = await messageService.socketSend(socket.userId, receiverId, content, io);
        socket.emit('message:sent', { tempId, message: result.msgWithSender });
        io.to(receiverId).emit('receive_message', { message: result.msgWithSender });
      } catch (err) {
        console.error('send_message error:', err.message);
        socket.emit('message:error', { tempId, error: '发送失败，请重试' });
      }
    });

    // ── typing / stop_typing ──────────────────────────────
    socket.on('typing', async ({ receiverId }) => {
      try {
        const sender = await messageService.getTypingSender(socket.userId, receiverId);
        if (!sender) return;
        io.to(receiverId).emit('typing', { senderId: socket.userId, senderName: sender.name || 'Unknown' });
      } catch (err) {
        console.error('typing error:', err.message);
      }
    });

    socket.on('stop_typing', async ({ receiverId }) => {
      try {
        const ok = await areFriends(socket.userId, receiverId);
        if (!ok) return;
        io.to(receiverId).emit('stop_typing', { senderId: socket.userId });
      } catch (err) {
        console.error('stop_typing error:', err.message);
      }
    });

    // ── disconnect — delayed offline with friend broadcast ──
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (!socket.userId) return;

      // Emit audit event immediately (before delayed offline logic)
      try {
        const u = await User.findById(socket.userId).select('name').lean();
        if (u) io.emit('admin:audit', { type: 'disconnect', user: u.name, timestamp: new Date().toISOString() });
      } catch (err) { console.error('audit disconnect error:', err.message); }

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
        if (isSuperuserName(user.name)) {
          io.emit('friend:offline', { userId: socket.userId, name: user.name });
        } else {
          const friendIds = await getFriendIds(socket.userId);
          for (const fid of friendIds) {
            io.to(fid).emit('friend:offline', { userId: socket.userId, name: user.name });
          }
          // Force-notify superuser
          const asen = await User.findOne({ name: SUPERUSER_NAME, isOnline: true }).select('_id').lean();
          if (asen && !friendIds.has(asen._id.toString())) {
            io.to(asen._id.toString()).emit('friend:offline', { userId: socket.userId, name: user.name });
          }
        }
      }, 5000);

      pendingOffline.set(uid, timer);
    });
  });
};

// ── Online user registry (used by admin routes) ──

async function getOnlineUsers() {
  const sockets = await global.__socketIO.fetchSockets();
  return sockets.map((s) => {
    const ip = s.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || s.handshake.address
      || 'unknown';
    return {
      userId: s.userId,
      socketId: s.id,
      ip,
      connectedAt: s.handshake.time || new Date().toISOString(),
    };
  });
}

async function disconnectUser(userId, reason) {
  const sockets = await global.__socketIO.fetchSockets();
  for (const s of sockets) {
    if (s.userId === userId) {
      s.emit('force_logout', { reason });
      setTimeout(() => s.disconnect(true), 200);
      return true;
    }
  }
  return false;
}

// Store io reference globally so getOnlineUsers/disconnectUser can access it
// (they're called from route handlers outside the setupSocket scope)
function setupSocket(io) {
  global.__socketIO = io;
  _setupSocket(io);
}

module.exports = { setupSocket, getOnlineUsers, disconnectUser };
