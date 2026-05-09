const User = require('../models/User');

const onlineCount = async () => {
  const count = await User.countDocuments({ isOnline: true });
  return count;
};

const setupSocket = (io) => {
  // Pending offline timers: userId → timeoutId
  const pendingOffline = new Map();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user:online', async (userId) => {
      try {
        // Cancel any pending offline for this user (mobile bg/fg)
        const pending = pendingOffline.get(userId);
        if (pending) {
          clearTimeout(pending);
          pendingOffline.delete(userId);
        }

        // Kick existing sockets for this user (one session per account)
        const existing = await io.fetchSockets();
        for (const s of existing) {
          if (s.id !== socket.id && s.userId === userId) {
            s.emit('force_logout', { reason: '您的账号在其他地方登录了' });
            s.disconnect(true);
          }
        }

        socket.userId = userId;
        socket.join(userId); // Join room for directed notifications
        const user = await User.findByIdAndUpdate(userId, { isOnline: true }, { new: true }).select('name avatarUrl');
        const count = await onlineCount();
        io.emit('online:count', { count });

        // Broadcast to others that this user came online
        if (user) {
          socket.broadcast.emit('user_online', { userId, name: user.name, avatarUrl: user.avatarUrl });
        }
      } catch (err) {
        console.error('user:online error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (socket.userId) {
        try {
          const uid = socket.userId.toString();

          // Delay offline broadcast — iOS Safari kills WebSocket on background.
          // If the user reconnects within 5s, cancel the timer (quick app switch).
          const timer = setTimeout(async () => {
            pendingOffline.delete(uid);

            const remaining = await io.fetchSockets();
            const hasOther = remaining.some(
              (s) => s.id !== socket.id && s.userId === socket.userId
            );

            if (!hasOther) {
              const user = await User.findByIdAndUpdate(socket.userId, { isOnline: false });
              const count = await onlineCount();
              io.emit('online:count', { count });

              if (user) {
                io.emit('user_offline', { userId: socket.userId, name: user.name });
              }
            }
          }, 5000);

          pendingOffline.set(uid, timer);
        } catch (err) {
          console.error('disconnect error:', err.message);
        }
      }
    });
  });
};

module.exports = setupSocket;
