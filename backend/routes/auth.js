const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, JWT_SECRET } = require('../middleware/auth');
const bus = require('../events/bus');
const validate = require('../middleware/validate');
const { register: registerSchema, login: loginSchema } = require('../validators/schemas');
const { isSuperuserName } = require('../services/superuser');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

module.exports = () => {
  const router = express.Router();

  // POST /api/auth/register
  router.post('/auth/register', upload.single('avatar'), uploadToCloudinary, validate(registerSchema), async (req, res, next) => {
    try {
      const { name, password } = req.body;

      const exists = await User.findOne({ name });
      if (exists) return res.status(400).json({ error: 'Name already taken' });

      const hash = await bcrypt.hash(password, 10);
      const ip = getClientIp(req);
      const now = new Date();
      const user = await User.create({
        name,
        password: hash,
        avatarUrl: req.cloudinaryUrl || '',
        registerIp: ip,
        lastLoginIp: ip,
        lastLoginAt: now,
      });

      const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      res.status(201).json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
      bus.emit('admin:audit', { type: 'register', user: name, ip, timestamp: now.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', validate(loginSchema), async (req, res, next) => {
    try {
      const { name, password } = req.body;
      const user = await User.findOne({ name });

      // Constant-time comparison: always run bcrypt to prevent user enumeration
      const hash = user?.password || '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const match = await bcrypt.compare(password || '', hash);

      if (!user || !match) return res.status(400).json({ error: 'Invalid credentials' });

      // Auto-promote superuser to admin
      if (isSuperuserName(user.name) && user.role !== 'admin') {
        user.role = 'admin';
      }

      // Update lastLoginIp / lastLoginAt on every login
      const ip = getClientIp(req);
      const now = new Date();
      user.lastLoginIp = ip;
      user.lastLoginAt = now;
      if (user.role === 'admin' && isSuperuserName(user.name)) {
        await user.save();
      } else {
        await User.findByIdAndUpdate(user._id, { lastLoginIp: ip, lastLoginAt: now });
      }

      const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
      bus.emit('admin:audit', { type: 'login', user: user.name, ip, timestamp: now.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/auth/me
  router.get('/auth/me', auth, async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select('-password');

      if (user && isSuperuserName(user.name) && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }

      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
