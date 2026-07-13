const { JWT_SECRET } = require('../config/auth');
const sessionService = require('../services/SessionService');

function bearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/);
  return match?.[1] || null;
}

// ── Policy: require valid token ──

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = bearerToken(header);
  if (!token) return res.status(401).json({ error: 'Invalid session' });

  try {
    req.user = await sessionService.hydrateToken(token);
    req.isAdmin = req.user.role === 'admin';
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    next(error);
  }
};

// ── Policy: optional auth — only requests without a header remain guests ──

const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return next();

  const token = bearerToken(header);
  if (!token) return res.status(401).json({ error: 'Invalid session' });

  try {
    req.user = await sessionService.hydrateToken(token);
    req.isAdmin = req.user.role === 'admin';
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    next(error);
  }
};

// ── Policy: admin guard — req.user was already hydrated from the database ──

const admin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
};

module.exports = { auth, admin, optionalAuth, JWT_SECRET };
