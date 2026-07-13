const express = require('express');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { report: reportSchema } = require('../validators/schemas');
const reportService = require('../services/ReportService');

const router = express.Router();

router.post('/reports', auth, contentLimiter, validate(reportSchema), async (req, res) => {
  const result = await reportService.submit({ viewer: req.user, ...req.body });
  res.status(result.created ? 201 : 200).json({ report: result.report });
});

module.exports = router;
