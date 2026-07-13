const express = require('express');
const Announcement = require('../models/Announcement');
const { auth, admin } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { announcement: announcementSchema } = require('../validators/schemas');
const { SUPERUSER_NAME } = require('../services/superuser');

const router = express.Router();

  // GET /api/announcements — public
  router.get('/announcements', async (req, res) => {
    const docs = await Announcement.find().sort({ createdAt: -1 }).lean();
    res.json({ announcements: docs });
  });

  // POST /api/announcements — admin only
  router.post('/announcements', auth, admin, contentLimiter, validate(announcementSchema), async (req, res) => {
    const { title, content } = req.body;

    const ann = await Announcement.create({
      title: title || '',
      content,
      author: SUPERUSER_NAME,
    });

    res.status(201).json({ announcement: ann });
  });

module.exports = router;
