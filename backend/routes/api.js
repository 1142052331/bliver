const express = require('express');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const footprintService = require('../services/FootprintService');
const validate = require('../middleware/validate');
const { checkin: checkinSchema, comment: commentSchema, reaction: reactionSchema } = require('../validators/schemas');

const authRoutes = require('./auth');
const notificationRoutes = require('./notifications');

const router = express.Router();

  // Mount sub-routers
  router.use(authRoutes);
  router.use(notificationRoutes);

  // ── Footprints ────────────────────────────────────────

  // GET /api/footprints/today?period=today|week|year
  router.get('/footprints/today', optionalAuth, async (req, res) => {
    const result = await footprintService.getToday(req.query.period || 'today', {
      isAdmin: req.isAdmin,
      userId: req.query.userId,
      isAdminMode: !!req.isAdmin,
    });
    res.json(result);
  });

  // GET /api/footprints/:id
  router.get('/footprints/:id', optionalAuth, async (req, res) => {
    const fp = await footprintService.getById(req.params.id, { isAdmin: req.isAdmin });
    if (!fp) return res.status(404).json({ error: 'Not found' });
    res.json({ footprint: fp });
  });

  // POST /api/checkin
  router.post('/checkin', auth, contentLimiter, upload.single('photo'), uploadToCloudinary, validate(checkinSchema), async (req, res) => {
    const { lat, lng, message, mood, precise } = req.body;

    const fp = await footprintService.create(req.user.id, {
      lat, lng, message, mood, precise,
      photoUrl: req.cloudinaryUrl || '',
    }, { isAdmin: req.user.role === 'admin' });

    res.status(201).json({ footprint: fp });
  });

  // POST /api/footprints/:id/react
  router.post('/footprints/:id/react', auth, contentLimiter, validate(reactionSchema), async (req, res) => {
    const result = await footprintService.react(
      req.params.id, req.user.id, req.user.name, req.body.emoji,
      { isAdmin: req.user.role === 'admin' }
    );
    if (!result) return res.status(404).json({ error: 'Not found' });

    res.json({ footprint: result.footprint });
  });

  // POST /api/footprints/:id/comment
  router.post('/footprints/:id/comment', auth, contentLimiter, validate(commentSchema), async (req, res) => {
    const { content } = req.body;
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.ip
      || req.socket.remoteAddress
      || '';

    const result = await footprintService.comment(
      req.params.id, req.user.id, req.user.name, content, ip,
      { isAdmin: req.user.role === 'admin' }
    );
    if (!result) return res.status(404).json({ error: 'Not found' });

    res.status(201).json({ footprint: result.footprint });
  });

  // DELETE /api/footprints/:footprintId/comments/:commentId
  router.delete('/footprints/:footprintId/comments/:commentId', auth, contentLimiter, async (req, res) => {
    const result = await footprintService.deleteComment(
      req.params.footprintId, req.params.commentId, req.user.id, req.user.name
    );
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ footprint: result.footprint });
  });

  // DELETE /api/footprints/:id (admin only)
  router.delete('/footprints/:id', auth, admin, async (req, res) => {
    const fp = await footprintService.delete(req.params.id, req.user.name);
    if (!fp) return res.status(404).json({ error: 'Not found' });

    res.json({ ok: true });
  });

  // ── Admin setup ───────────────────────────────────────

  router.post('/admin/setup', auth, async (req, res) => {
    const adminService = require('../services/AdminService');
    const result = await adminService.setupAdmin(req.user.id, req.body.secret);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, message: result.message });
  });

module.exports = router;
