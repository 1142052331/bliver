const User = require('../models/User');

const onlineCount = async () => {
  const count = await User.countDocuments({ isOnline: true });
  return count;
};

const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user:online', async (userId) => {
      try {
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
          const user = await User.findByIdAndUpdate(socket.userId, { isOnline: false });
          const count = await onlineCount();
          io.emit('online:count', { count });

          if (user) {
            socket.broadcast.emit('user_offline', { userId: socket.userId, name: user.name });
          }
        } catch (err) {
          console.error('disconnect error:', err.message);
        }
      }
    });
  });
};

module.exports = setupSocket;
