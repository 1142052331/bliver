const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, JWT_SECRET } = require('../middleware/auth');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

module.exports = (io) => {
  const router = express.Router();

  // POST /api/auth/register
  router.post('/auth/register', upload.single('avatar'), uploadToCloudinary, async (req, res) => {
    try {
      const { name, password } = req.body;
      if (!name || !password) return res.status(400).json({ error: 'Name and password required' });

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
      io.emit('admin:audit', { type: 'register', user: name, ip, timestamp: now.toISOString() });
    } catch (err) {
      console.error('[auth]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', async (req, res) => {
    try {
      const { name, password } = req.body;
      const user = await User.findOne({ name });

      // Constant-time comparison: always run bcrypt to prevent user enumeration
      const hash = user?.password || '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const match = await bcrypt.compare(password || '', hash);

      if (!user || !match) return res.status(400).json({ error: 'Invalid credentials' });

      // Auto-promote 阿森 to admin
      if (user.name === '阿森' && user.role !== 'admin') {
        user.role = 'admin';
      }

      // Update lastLoginIp / lastLoginAt on every login
      const ip = getClientIp(req);
      const now = new Date();
      user.lastLoginIp = ip;
      user.lastLoginAt = now;
      if (user.role === 'admin' && user.name === '阿森') {
        await user.save();
      } else {
        await User.findByIdAndUpdate(user._id, { lastLoginIp: ip, lastLoginAt: now });
      }

      const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
      io.emit('admin:audit', { type: 'login', user: user.name, ip, timestamp: now.toISOString() });
    } catch (err) {
      console.error('[auth]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/auth/me
  router.get('/auth/me', auth, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('-password');

      if (user && user.name === '阿森' && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }

      res.json({ user });
    } catch (err) {
      console.error('[auth]', err); res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
