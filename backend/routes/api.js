const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { reverseGeocode } = require('../services/nominatim');
const { getWeather } = require('../services/weather');

module.exports = (io) => {
  const router = express.Router();

  // ── Auth ──────────────────────────────────────────────

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
      res.status(201).json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl }, token });
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

      const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/me
  router.get('/auth/me', auth, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ user });
  });

  // ── Footprints ────────────────────────────────────────

  // GET /api/footprints/today
  router.get('/footprints/today', async (req, res) => {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const footprints = await Footprint.find({
        createdAt: { $gte: start, $lte: end },
      }).populate('userId', 'name avatarUrl isOnline').sort({ createdAt: -1 });

      res.json({ footprints });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/checkin (protected)
  router.post('/checkin', auth, upload.single('photo'), uploadToCloudinary, async (req, res) => {
    try {
      const { lat, lng, message } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat, lng are required' });
      }

      const latNum = Number(lat);
      const lngNum = Number(lng);

      const [placeName, weatherData] = await Promise.all([
        reverseGeocode(latNum, lngNum),
        getWeather(latNum, lngNum),
      ]);

      const footprint = await Footprint.create({
        userId:    req.user.id,
        location:  { lat: latNum, lng: lngNum },
        placeName: placeName,
        message:   `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}  — ${message || ''}`,
        photoUrl:  req.cloudinaryUrl || '',
      });

      const populated = await Footprint.findById(footprint._id)
        .populate('userId', 'name avatarUrl isOnline');

      io.emit('footprint:new', { footprint: populated });

      res.status(201).json({ footprint: populated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/footprints/:id/like (protected)
  router.post('/footprints/:id/like', auth, async (req, res) => {
    try {
      const fp = await Footprint.findById(req.params.id);
      if (!fp) return res.status(404).json({ error: 'Not found' });

      const idx = fp.likes.indexOf(req.user.id);
      if (idx === -1) {
        fp.likes.push(req.user.id);
      } else {
        fp.likes.splice(idx, 1);
      }
      await fp.save();

      const populated = await Footprint.findById(fp._id)
        .populate('userId', 'name avatarUrl isOnline')
        .populate('likes', 'name avatarUrl');

      io.emit('footprint:updated', { footprint: populated });

      res.json({ footprint: populated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
