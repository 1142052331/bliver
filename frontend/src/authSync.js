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
 * @param {string} userId — the user who just logged out
 */
export function broadcastLogout(userId) {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ type: 'logout', userId, ts: Date.now() });
}

/**
 * Listen for auth changes from other tabs.
 * @param {{ currentUserId: string, onForeignLogin: () => void, onForeignLogout: () => void }}
 */
export function listenAuthSync({ currentUserId, onForeignLogin, onForeignLogout }) {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (event) => {
    // BroadcastChannel does NOT deliver to sender — only OTHER tabs receive this
    const { type, userId } = event.data;
    if (!userId) return;
    if (type === 'login' && userId !== currentUserId) {
      // Different user logged in elsewhere → our session is stale
      onForeignLogin?.();
    } else if (type === 'logout' && userId === currentUserId) {
      // Same user logged out elsewhere → sync logout
      onForeignLogout?.();
    }
    // Same-user login or different-user logout → ignore
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
