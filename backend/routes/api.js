const express = require('express');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { upload, uploadToCloudinary } = require('../middleware/upload');
const { reverseGeocode } = require('../services/nominatim');
const { getWeather } = require('../services/weather');

module.exports = (io) => {
  const router = express.Router();

  // POST /api/users/register — register or login by name
  router.post('/users/register', async (req, res) => {
    try {
      const { name, avatarUrl } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      let user = await User.findOne({ name });
      if (!user) {
        user = await User.create({ name, avatarUrl: avatarUrl || '' });
      } else if (avatarUrl) {
        user.avatarUrl = avatarUrl;
        await user.save();
      }

      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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

  // POST /api/checkin — full check-in pipeline
  router.post('/checkin', upload.single('photo'), uploadToCloudinary, async (req, res) => {
    try {
      const { userId, lat, lng, message } = req.body;
      if (!userId || lat == null || lng == null) {
        return res.status(400).json({ error: 'userId, lat, lng are required' });
      }

      const latNum = Number(lat);
      const lngNum = Number(lng);

      const [placeName, weatherData] = await Promise.all([
        reverseGeocode(latNum, lngNum),
        getWeather(latNum, lngNum),
      ]);

      const footprint = await Footprint.create({
        userId,
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

  return router;
};
