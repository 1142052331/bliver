const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const activityService = require('../services/ActivityService');

const router = express.Router();

router.get('/activity', optionalAuth, async (req, res) => {
  const result = await activityService.listActivity({
    viewer: req.user || null,
    query: req.query,
  });
  res.json(result);
});

module.exports = router;
