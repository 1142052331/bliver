const express = require('express');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, admin, optionalAuth } = require('../middleware/auth');
const { contentLimiter, adminSetupLimiter } = require('../middleware/rateLimiter');
const footprintService = require('../services/FootprintService');
const footprintReadService = require('../services/FootprintReadService');
const validate = require('../middleware/validate');
const {
  checkin: checkinSchema,
  comment: commentSchema,
  reaction: reactionSchema,
  adminSetup: adminSetupSchema,
} = require('../validators/schemas');

const authRoutes = require('./auth');
const notificationRoutes = require('./notifications');
const mapRoutes = require('./map');
const reportRoutes = require('./reports');

const router = express.Router();

  // Mount sub-routers
  router.use(authRoutes);
  router.use(notificationRoutes);
  router.use(mapRoutes);
  router.use(reportRoutes);

  // ── Footprints ────────────────────────────────────────

  router.put('/footprints/:id/read', auth, async (req, res) => {
    await footprintReadService.markRead({
      viewer: req.user,
      footprintId: req.params.id,
    });
    res.json({ ok: true });
  });

  router.post('/footprints/read-state/import', auth, async (req, res) => {
    const result = await footprintReadService.importLegacy({
      viewer: req.user,
      entries: req.body.entries,
    });
    res.json(result);
  });

  // GET /api/footprints/today?period=today|week|year
  router.get('/footprints/today', optionalAuth, async (req, res) => {
    const result = await footprintService.getToday(req.query.period || 'today', {
      viewer: req.user || null,
      userId: req.query.userId,
    });
    res.json(result);
  });

  // GET /api/footprints/:id
  router.get('/footprints/:id', optionalAuth, async (req, res) => {
    const fp = await footprintService.getById(req.params.id, { viewer: req.user || null });
    if (!fp) return res.status(404).json({ error: 'Not found' });
    res.json({ footprint: fp });
  });

  // POST /api/checkin
  router.post('/checkin', auth, contentLimiter, upload.single('photo'), validate(checkinSchema), uploadToCloudinary, async (req, res) => {
    const { lat, lng, message, mood, precise, visibility, locationPrecision } = req.body;

    const fp = await footprintService.create(req.user.id, {
      lat, lng, message, mood, precise, visibility, locationPrecision,
      photoUrl: req.cloudinaryUrl || '',
    }, { isAdmin: req.user.role === 'admin' });

    res.status(201).json({ footprint: fp });
  });

  // POST /api/footprints/:id/react
  router.post('/footprints/:id/react', auth, contentLimiter, validate(reactionSchema), async (req, res) => {
    const result = await footprintService.react(
      req.params.id, req.user.id, req.user.name, req.body.emoji,
      { viewer: req.user }
    );
    if (!result) return res.status(404).json({ error: 'Not found' });

    res.json({ footprint: result.footprint });
  });

  // POST /api/footprints/:id/comment
  router.post('/footprints/:id/comment', auth, contentLimiter, validate(commentSchema), async (req, res) => {
    const { content, parentCommentId, replyToCommentId } = req.body;
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.ip
      || req.socket.remoteAddress
      || '';

    const result = await footprintService.comment(
      req.params.id, req.user.id, req.user.name, content, ip,
      { viewer: req.user, parentCommentId, replyToCommentId }
    );
    if (!result) return res.status(404).json({ error: 'Not found' });

    res.status(201).json({ footprint: result.footprint });
  });

  // DELETE /api/footprints/:footprintId/comments/:commentId
  router.delete('/footprints/:footprintId/comments/:commentId', auth, contentLimiter, async (req, res) => {
    const result = await footprintService.deleteComment(
      req.params.footprintId, req.params.commentId, req.user.id, req.user.name,
      { viewer: req.user }
    );
    res.json({ footprint: result.footprint });
  });

  // DELETE /api/footprints/:id (admin only)
  router.delete('/footprints/:id', auth, admin, async (req, res) => {
    const fp = await footprintService.delete(req.params.id, req.user.name);
    if (!fp) return res.status(404).json({ error: 'Not found' });

    res.json({ ok: true });
  });

  // ── Admin setup ───────────────────────────────────────

  router.post('/admin/setup', adminSetupLimiter, auth, validate(adminSetupSchema), async (req, res) => {
    const adminService = require('../services/AdminService');
    const result = await adminService.setupAdmin(req.user.id, req.body.secret);
    res.json({ ok: true, message: result.message, token: result.token });
  });

  // ── Feedback ──────────────────────────────────────────

  router.post('/feedback', auth, async (req, res) => {
    const Feedback = require('../models/Feedback');
    const { rating, content } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1-5 required' });
    const fb = await Feedback.create({ userId: req.user.id, rating, content: content || '' });
    res.json({ ok: true, feedback: fb });
  });

  router.get('/admin/feedback', auth, admin, async (req, res) => {
    const Feedback = require('../models/Feedback');
    const list = await Feedback.find().populate('userId', 'name avatarUrl').sort({ createdAt: -1 }).lean();
    res.json({ feedback: list });
  });

module.exports = router;
