const express = require('express');
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { auth } = require('../middleware/auth');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BMFEhvJfmygc8SVFDdq6LrBHSGcLFaj0YTUk9uF2GeJDh6z2nIc_RjmczJ9ckbsTVg-Gtg1BO_PhJtzIpQUiYoU';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'uSXARIb_oolf2oqNpbpsp0wGft4Xc6J_FEbqtM15qK4';

webpush.setVapidDetails(
  'mailto:bliver@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

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

      await PushSubscription.findOneAndUpdate(
        { endpoint },
        { userId: req.user.id, endpoint, keys },
        { upsert: true, new: true }
      );

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
        console.error(`[Push] Send failed: ${r.reason?.message || r.reason}`);
        if (r.reason?.statusCode === 410) {
          gone.push(subs[i].endpoint);
        }
      } else {
        console.log(`[Push] Sent successfully to subscription ${i}`);
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
