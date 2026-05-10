/**
 * Cross-tab auth synchronization via BroadcastChannel.
 *
 * When Tab B logs in/out, Tab A receives the broadcast and
 * either clears its own stale session or reloads to sync.
 */

const CHANNEL = 'bliver_auth_sync';
let channel = null;

function getChannel() {
  if (!channel) {
    try { channel = new BroadcastChannel(CHANNEL); } catch { return null; }
  }
  return channel;
}

/**
 * Broadcast a login event to other tabs.
 * @param {{ _id: string, name: string }} user
 */
export function broadcastLogin(user) {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ type: 'login', userId: user._id, name: user.name, ts: Date.now() });
}

/**
 * Broadcast a logout event to other tabs.
 */
export function broadcastLogout() {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ type: 'logout', ts: Date.now() });
}

/**
 * Listen for auth changes from other tabs.
 * @param {{ currentUserId: string, onForeignLogin: () => void, onForeignLogout: () => void }}
 */
export function listenAuthSync({ currentUserId, onForeignLogin, onForeignLogout }) {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (event) => {
    // Ignore messages from self (BroadcastChannel doesn't deliver to sender)
    const { type, userId } = event.data;
    if (type === 'login' && userId !== currentUserId) {
      onForeignLogin?.();
    } else if (type === 'logout') {
      onForeignLogout?.();
    }
  };

  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

/**
 * Close the channel (on app teardown).
 */
export function closeChannel() {
  if (channel) {
    channel.close();
    channel = null;
  }
}
