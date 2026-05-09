const express = require('express');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  // GET /api/notifications
  router.get('/notifications', auth, async (req, res) => {
    try {
      const notifs = await Notification.find({ recipientId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json({ notifications: notifs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/notifications/:id/read
  router.put('/notifications/:id/read', auth, async (req, res) => {
    try {
      await Notification.findOneAndUpdate(
        { _id: req.params.id, recipientId: req.user.id },
        { isRead: true }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
