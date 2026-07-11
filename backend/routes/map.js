const express = require('express');
const AppError = require('../middleware/AppError');
const { optionalAuth } = require('../middleware/auth');
const footprintQueryService = require('../services/FootprintQueryService');
const { reverseGeocodeStructured } = require('../services/nominatim');

const router = express.Router();

router.get('/map/footprints', optionalAuth, async (req, res) => {
  const result = await footprintQueryService.listMap({
    viewer: req.user || null,
    query: req.query,
  });
  res.json(result);
});

router.post('/map/location-context', optionalAuth, async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new AppError(400, 'Invalid coordinates');
  }
  res.json({ location: await reverseGeocodeStructured(lat, lng) });
});

module.exports = router;
