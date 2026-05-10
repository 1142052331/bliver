const express = require('express');
const Announcement = require('../models/Announcement');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');

module.exports = () => {
  const router = express.Router();

  // GET /api/announcements — public
  router.get('/announcements', async (req, res) => {
    try {
      const docs = await Announcement.find().sort({ createdAt: -1 }).lean();
      res.json({ announcements: docs });
    } catch (err) {
      console.error('[announcements]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/announcements — only 阿森
  router.post('/announcements', auth, contentLimiter, async (req, res) => {
    try {
      if (req.user.name !== '阿森') {
        return res.status(403).json({ error: '仅管理员可发布公告' });
      }

      const { title, content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: '公告内容不能为空' });
      }
      if (content.length > 500) {
        return res.status(400).json({ error: '公告不能超过500字' });
      }

      const ann = await Announcement.create({
        title: title?.trim() || '',
        content: content.trim(),
        author: '阿森',
      });

      res.status(201).json({ announcement: ann });
    } catch (err) {
      console.error('[announcements]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
