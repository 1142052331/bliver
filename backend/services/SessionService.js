const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { JWT_SECRET } = require('../config/auth');
const AppError = require('../middleware/AppError');
const User = require('../models/User');

function invalidSession() {
  return new AppError(401, 'Invalid session');
}

function issueToken(user) {
  return jwt.sign({
    id: String(user._id || user.id),
    sessionVersion: user.sessionVersion ?? 0,
  }, JWT_SECRET, { expiresIn: '30d' });
}

async function hydrateToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw invalidSession();
  }

  if (!payload.id || !mongoose.isObjectIdOrHexString(payload.id)) {
    throw invalidSession();
  }

  const user = await User.findById(payload.id)
    .select('name role sessionVersion systemIdentity');
  const tokenVersion = payload.sessionVersion ?? 0;
  const sessionVersion = user?.sessionVersion ?? 0;

  if (!user || tokenVersion !== sessionVersion) {
    throw invalidSession();
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    sessionVersion,
    systemIdentity: user.systemIdentity || null,
  };
}

module.exports = { issueToken, hydrateToken };
