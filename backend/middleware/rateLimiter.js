const rateLimit = require('express-rate-limit');

// Auth: 10 attempts per 15 min per IP (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: '登录尝试过于频繁，请15分钟后再试' },
});

// Content creation: 30 req/min per IP (prevents flooding)
const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: '操作过于频繁，请稍后再试' },
});

module.exports = { authLimiter, contentLimiter };
