const express = require('express');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { register: registerSchema, login: loginSchema } = require('../validators/schemas');
const authService = require('../services/AuthService');
const auditService = require('../services/AuditService');

const router = express.Router();

// POST /api/auth/register
router.post('/auth/register', authLimiter, upload.single('avatar'), uploadToCloudinary, validate(registerSchema), async (req, res) => {
  const { name, password } = req.body;
  const ip = authService.getClientIp(req);
  const result = await authService.register({ name, password, avatarUrl: req.cloudinaryUrl || '', ip });
  auditService.log({ type: 'register', actor: name, ip });
  res.status(201).json({ user: result.user, token: result.token });
});

// POST /api/auth/login
router.post('/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { name, password } = req.body;
  const ip = authService.getClientIp(req);
  const result = await authService.login(name, password, ip);
  auditService.log({ type: 'login', actor: name, ip });
  res.json({ user: result.user, token: result.token });
});

// GET /api/auth/me
router.get('/auth/me', auth, async (req, res) => {
  const user = await authService.getMe(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
