const express = require('express');
const Announcement = require('../models/Announcement');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { announcement: announcementSchema } = require('../validators/schemas');
const { SUPERUSER_NAME, isSuperuserName } = require('../services/superuser');

module.exports = () => {
  const router = express.Router();

  // GET /api/announcements — public
  router.get('/announcements', async (req, res, next) => {
    try {
      const docs = await Announcement.find().sort({ createdAt: -1 }).lean();
      res.json({ announcements: docs });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/announcements — superuser only
  router.post('/announcements', auth, contentLimiter, validate(announcementSchema), async (req, res, next) => {
    try {
      if (!isSuperuserName(req.user.name)) {
        return res.status(403).json({ error: '仅管理员可发布公告' });
      }

      const { title, content } = req.body;

      const ann = await Announcement.create({
        title: title || '',
        content,
        author: SUPERUSER_NAME,
      });

      res.status(201).json({ announcement: ann });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
