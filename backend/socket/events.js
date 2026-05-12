const bus = require('../events/bus');

let _io = null;

function init(io) {
  _io = io;
}

function setupSocketEvents() {
  // ── Broadcast events: relay to all connected sockets ──
  const broadcast = ['footprint:new', 'footprint:updated', 'footprint:deleted', 'profile:updated', 'admin:audit'];
  for (const event of broadcast) {
    bus.on(event, (data) => {
      _io.emit(event, data);
    });
  }

  // ── Targeted: notification to recipient's room ──
  bus.on('new_notification', ({ recipientId, notification }) => {
    _io.to(recipientId.toString()).emit('new_notification', { notification });
  });
}

module.exports = { init, setupSocketEvents };
