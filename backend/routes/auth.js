const express = require('express');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth } = require('../middleware/auth');
const bus = require('../events/bus');
const validate = require('../middleware/validate');
const { register: registerSchema, login: loginSchema } = require('../validators/schemas');
const authService = require('../services/AuthService');

const router = express.Router();

// POST /api/auth/register
router.post('/auth/register', upload.single('avatar'), uploadToCloudinary, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const result = await authService.register({ name, password, avatarUrl: req.cloudinaryUrl || '' });
    if (result.error) return res.status(result.status).json({ error: result.error });

    const ip = authService.getClientIp(req);
    const now = new Date().toISOString();
    bus.emit('admin:audit', { type: 'register', user: name, ip, timestamp: now });
    res.status(201).json({ user: result.user, token: result.token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const ip = authService.getClientIp(req);
    const result = await authService.login(name, password, ip);
    if (result.error) return res.status(result.status).json({ error: result.error });

    bus.emit('admin:audit', { type: 'login', user: name, ip, timestamp: new Date().toISOString() });
    res.json({ user: result.user, token: result.token });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/auth/me', auth, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
