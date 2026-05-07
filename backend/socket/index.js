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
        await User.findByIdAndUpdate(userId, { isOnline: true });
        const count = await onlineCount();
        io.emit('online:count', { count });
      } catch (err) {
        console.error('user:online error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (socket.userId) {
        try {
          await User.findByIdAndUpdate(socket.userId, { isOnline: false });
          const count = await onlineCount();
          io.emit('online:count', { count });
        } catch (err) {
          console.error('disconnect error:', err.message);
        }
      }
    });
  });
};

module.exports = setupSocket;
