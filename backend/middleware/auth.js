const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is required');

// ── Mechanism: pure JWT verification ──

function _verifyToken(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Policy: require valid token ──

const auth = (req, res, next) => {
  const user = _verifyToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'No token' });
  req.user = user;
  next();
};

// ── Policy: soft auth — sets req.user + req.isAdmin if token valid, always passes ──

const optionalAuth = (req, res, next) => {
  const user = _verifyToken(req.headers.authorization);
  if (user) {
    req.user = user;
    req.isAdmin = user.role === 'admin';
  }
  next();
};

// ── Policy: admin guard — trusts JWT role first, falls back to DB for stale tokens ──

const admin = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') return next();
    // Stale JWT: user was promoted but token still has old role
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { auth, admin, optionalAuth, JWT_SECRET };
