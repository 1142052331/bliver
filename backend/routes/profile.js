const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const profileService = require('../services/ProfileService');
const interactionPolicy = require('../services/InteractionPolicy');
const validate = require('../middleware/validate');
const { profileUpdate } = require('../validators/schemas');

const router = express.Router();

// GET /api/users/:id/profile
router.get('/users/:id/profile', optionalAuth, async (req, res) => {
  const viewer = req.user || null;
  if (viewer) {
    const decision = await interactionPolicy.canViewProfile(viewer.id, req.params.id);
    if (!decision.allowed) return res.status(404).json({ error: 'User not found' });
  }
  const result = await profileService.getProfile(req.params.id, viewer, {
    includeActivity: req.query.view !== 'core',
  });
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json(result);
});

// POST /api/users/:id/profile/comment
router.post('/users/:id/profile/comment', auth, contentLimiter, async (req, res) => {
  const decision = await interactionPolicy.canViewProfile(req.user.id, req.params.id);
  if (!decision.allowed) return res.status(403).json({ error: decision.reason });
  const result = await profileService.addComment(req.params.id, req.user.name, req.body.content);
  res.status(201).json({ user: result.user });
});

// POST /api/users/:id/profile/react
router.post('/users/:id/profile/react', auth, contentLimiter, async (req, res) => {
  const decision = await interactionPolicy.canViewProfile(req.user.id, req.params.id);
  if (!decision.allowed) return res.status(403).json({ error: decision.reason });
  const result = await profileService.toggleReaction(req.params.id, req.user.id, req.body.emoji);
  res.json({ user: result.user });
});

// POST /api/users/profile/banner
router.post('/users/profile/banner', auth, upload.single('banner'), uploadToCloudinary, async (req, res) => {
  const result = await profileService.updateBanner(req.user.id, req.cloudinaryUrl);
  res.json({ user: result.user });
});

// PUT /api/users/profile
router.put('/users/profile', auth, upload.single('avatar'), uploadToCloudinary, validate(profileUpdate), async (req, res) => {
  const result = await profileService.updateProfile(req.user.id, {
    name: req.body.name,
    cloudinaryUrl: req.cloudinaryUrl,
  });
  res.json({ user: result.user });
});

module.exports = router;
