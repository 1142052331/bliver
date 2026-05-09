const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, JWT_SECRET } = require('../middleware/auth');

module.exports = () => {
  const router = express.Router();

  // POST /api/auth/register
  router.post('/auth/register', upload.single('avatar'), uploadToCloudinary, async (req, res) => {
    try {
      const { name, password } = req.body;
      if (!name || !password) return res.status(400).json({ error: 'Name and password required' });

      const exists = await User.findOne({ name });
      if (exists) return res.status(400).json({ error: 'Name already taken' });

      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        password: hash,
        avatarUrl: req.cloudinaryUrl || '',
      });

      const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      res.status(201).json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', async (req, res) => {
    try {
      const { name, password } = req.body;
      const user = await User.findOne({ name });
      if (!user) return res.status(400).json({ error: 'User not found' });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).json({ error: 'Wrong password' });

      // Auto-promote 阿森 to admin
      if (user.name === '阿森' && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }

      const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl, role: user.role }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
