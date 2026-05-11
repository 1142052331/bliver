const express = require('express');
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { auth } = require('../middleware/auth');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

let vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:bliver@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
} else {
  console.warn('[Push] VAPID keys not configured — push notifications disabled');
}

module.exports = () => {
  const router = express.Router();

  // GET /api/push/vapid-public-key
  router.get('/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // POST /api/push/subscribe (protected)
  router.post('/push/subscribe', auth, async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription' });
      }

      const sub = await PushSubscription.findOneAndUpdate(
        { endpoint },
        { userId: req.user.id, endpoint, keys },
        { upsert: true, returnDocument: 'after' }
      );
      const total = await PushSubscription.countDocuments({ userId: req.user.id });
      console.log(`[Push] Sub saved for user ${req.user.id.slice(-6)} (${req.user.name}), total subs: ${total}`);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/push/unsubscribe (protected)
  router.post('/push/unsubscribe', auth, async (req, res) => {
    try {
      await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

// ── Push sending helper ──────────────────────────────────

async function sendPushToUser(userId, payload) {
  if (!vapidReady) return;
  try {
    const subs = await PushSubscription.find({ userId });
    console.log(`[Push] Sending to user ${userId}: ${subs.length} subscription(s)`);

    if (subs.length === 0) {
      console.log('[Push] No subscriptions found for user, skipping');
      return;
    }

    const data = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          data
        )
      )
    );

    // Remove expired subscriptions
    const gone = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = r.reason?.statusCode || 'unknown';
        const body = r.reason?.body || '';
        console.error(`[Push] Send failed #${i} (${code}): ${r.reason?.message || r.reason} body=${body}`);
        if (code === 410 || code === 404) {
          gone.push(subs[i].endpoint);
        }
      } else {
        console.log(`[Push] Sent #${i} OK: statusCode=${r.value?.statusCode}, body=${JSON.stringify(r.value?.body).slice(0,80)}`);
      }
    });
    if (gone.length > 0) {
      await PushSubscription.deleteMany({ endpoint: { $in: gone } });
      console.log(`[Push] Removed ${gone.length} expired subscription(s)`);
    }
  } catch (err) {
    console.error('[Push] Error:', err.message);
  }
}

module.exports.sendPushToUser = sendPushToUser;
