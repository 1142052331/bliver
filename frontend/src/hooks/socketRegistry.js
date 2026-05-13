/**
 * Central socket event registry.
 * Multiple components can register handlers for the same event.
 * The registry dispatches to all registered handlers.
 */

let _socket = null;
const _handlers = new Map(); // event → { dispatch, Set<handler> }

function ensureEntry(event) {
  if (!_handlers.has(event)) {
    const handlers = new Set();
    const dispatch = (data) => {
      for (const h of handlers) h(data);
    };
    _handlers.set(event, { dispatch, handlers });
  }
  return _handlers.get(event);
}

export function setSocket(socket) {
  // Re-attach existing dispatchers to new socket
  if (_socket) {
    for (const [event, { dispatch }] of _handlers) {
      _socket.off(event, dispatch);
    }
  }
  _socket = socket;
  if (socket) {
    for (const [event, { dispatch }] of _handlers) {
      socket.on(event, dispatch);
    }
  }
}

export function clearSocket() {
  if (_socket) {
    for (const [event, { dispatch }] of _handlers) {
      _socket.off(event, dispatch);
    }
  }
  _socket = null;
}

export function on(event, handler) {
  const entry = ensureEntry(event);
  entry.handlers.add(handler);
  if (_socket && entry.handlers.size === 1) {
    _socket.on(event, entry.dispatch);
  }
}

export function off(event, handler) {
  const entry = _handlers.get(event);
  if (!entry) return;
  entry.handlers.delete(handler);
  if (entry.handlers.size === 0 && _socket) {
    _socket.off(event, entry.dispatch);
    _handlers.delete(event);
  }
}
