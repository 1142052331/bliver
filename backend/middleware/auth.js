const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is required');

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const admin = async (req, res, next) => {
  try {
    // Trust JWT role first (saves DB query), fall back to DB on cache miss
    if (req.user.role === 'admin') return next();
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Soft auth — doesn't reject; sets req.isAdmin if valid admin token
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const user = jwt.verify(header.split(' ')[1], JWT_SECRET);
      req.isAdmin = user.role === 'admin';
    } catch {}
  }
  next();
};

module.exports = { auth, admin, optionalAuth, JWT_SECRET };
