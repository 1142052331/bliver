const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const { auth } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY } = require('../services/push');

const router = express.Router();

  // GET /api/push/vapid-public-key
  router.get('/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // POST /api/push/subscribe (protected)
  router.post('/push/subscribe', auth, async (req, res, next) => {
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
      next(err);
    }
  });

  // POST /api/push/unsubscribe (protected)
  router.post('/push/unsubscribe', auth, async (req, res, next) => {
    try {
      await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

module.exports = router;

// sendPushToUser is now in services/push.js
// Legacy re-export removed — import from '../services/push' directly.
