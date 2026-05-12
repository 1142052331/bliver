const EventEmitter = require('events');

const bus = new EventEmitter();

bus.on('error', (err) => {
  console.error('[EventBus] Listener error:', err.message);
});

module.exports = bus;
