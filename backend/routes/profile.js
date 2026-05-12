const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const profileService = require('../services/ProfileService');

const router = express.Router();

// GET /api/users/:id/profile
router.get('/users/:id/profile', optionalAuth, async (req, res) => {
  try {
    const viewer = req.user || null;
    const result = await profileService.getProfile(req.params.id, viewer, req.isAdmin);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json(result);
  } catch (err) {
    console.error('[profile]', err); res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/profile/comment
router.post('/users/:id/profile/comment', auth, contentLimiter, async (req, res) => {
  try {
    const result = await profileService.addComment(req.params.id, req.user.name, req.body.content);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ user: result.user });
  } catch (err) {
    console.error('[profile]', err); res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/profile/react
router.post('/users/:id/profile/react', auth, contentLimiter, async (req, res) => {
  try {
    const result = await profileService.toggleReaction(req.params.id, req.user.id, req.body.emoji);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ user: result.user });
  } catch (err) {
    console.error('[profile]', err); res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/profile/banner
router.post('/users/profile/banner', auth, upload.single('banner'), uploadToCloudinary, async (req, res) => {
  try {
    const result = await profileService.updateBanner(req.user.id, req.cloudinaryUrl);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ user: result.user });
  } catch (err) {
    console.error('[profile]', err); res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/profile
router.put('/users/profile', auth, upload.single('avatar'), uploadToCloudinary, async (req, res) => {
  try {
    const result = await profileService.updateProfile(req.user.id, {
      name: req.body.name,
      cloudinaryUrl: req.cloudinaryUrl,
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ user: result.user });
  } catch (err) {
    console.error('[profile]', err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
