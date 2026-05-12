let _io = null;

function init(io) {
  _io = io;
}

async function getOnlineUsers() {
  const sockets = await _io.fetchSockets();
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
  const sockets = await _io.fetchSockets();
  for (const s of sockets) {
    if (s.userId === userId) {
      s.emit('force_logout', { reason });
      setTimeout(() => s.disconnect(true), 200);
      return true;
    }
  }
  return false;
}

module.exports = { init, getOnlineUsers, disconnectUser };
