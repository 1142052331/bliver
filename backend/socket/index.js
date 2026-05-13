const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { areFriends } = require('../services/FriendsService');
const messageService = require('../services/MessageService');
const { getBroadcastTargets, getFriendIds } = require('../services/SuperuserPolicy');
const bus = require('../events/bus');

const onlineCount = async () => {
  const count = await User.countDocuments({ isOnline: true });
  return count;
};

function _setupSocket(io) {
  // ── Broadcast events: relay domain events to all connected sockets ──
  const broadcast = ['footprint:new', 'footprint:updated', 'footprint:deleted', 'profile:updated'];
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

        const payload = { userId, name: user.name, avatarUrl: user.avatarUrl };
        const targets = await getBroadcastTargets(userId, user.name);
        if (targets.mode === 'all') {
          socket.broadcast.emit('friend:online', payload);
        } else {
          for (const fid of targets.friendIds) {
            io.to(fid).emit('friend:online', payload);
          }
          if (targets.superuserId && !targets.friendIds.has(targets.superuserId.toString())) {
            io.to(targets.superuserId.toString()).emit('friend:online', payload);
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
        const offlinePayload = { userId: socket.userId, name: user.name };
        const offlineTargets = await getBroadcastTargets(socket.userId, user.name);
        if (offlineTargets.mode === 'all') {
          io.emit('friend:offline', offlinePayload);
        } else {
          for (const fid of offlineTargets.friendIds) {
            io.to(fid).emit('friend:offline', offlinePayload);
          }
          if (offlineTargets.superuserId && !offlineTargets.friendIds.has(offlineTargets.superuserId.toString())) {
            io.to(offlineTargets.superuserId.toString()).emit('friend:offline', offlinePayload);
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
