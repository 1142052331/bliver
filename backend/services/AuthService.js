const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../middleware/AppError');
const sessionService = require('./SessionService');
const { assertNameClaimAllowed } = require('./UserIdentityPolicy');

const CURRENT_USER_FIELDS = 'name avatarUrl profileBannerUrl role systemIdentity lastFootprintVisibility';

function toCurrentUserDto(user) {
  const id = String(user._id);
  return {
    _id: id,
    id,
    name: user.name,
    avatarUrl: user.avatarUrl || '',
    profileBannerUrl: user.profileBannerUrl || '',
    role: user.role,
    systemIdentity: user.systemIdentity || null,
    lastFootprintVisibility: user.lastFootprintVisibility || 'public',
  };
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function register({ name, password, avatarUrl, ip }) {
  assertNameClaimAllowed(name);
  const exists = await User.findOne({ name });
  if (exists) throw new AppError(400, 'Name already taken');

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();
  const user = await User.create({
    name,
    password: hash,
    avatarUrl: avatarUrl || '',
    registerIp: ip || '',
    lastLoginIp: ip || '',
    lastLoginAt: now,
  });

  const token = sessionService.issueToken(user);
  return { user: toCurrentUserDto(user), token };
}

async function login(name, password, ip) {
  const user = await User.findOne({ name });

  const hash = user?.password || '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const match = await bcrypt.compare(password || '', hash);

  if (!user || !match) throw new AppError(400, 'Invalid credentials');

  const now = new Date();
  user.lastLoginIp = ip;
  user.lastLoginAt = now;
  await User.findByIdAndUpdate(user._id, { lastLoginIp: ip, lastLoginAt: now });

  const token = sessionService.issueToken(user);
  return { user: toCurrentUserDto(user), token };
}

async function getMe(userId) {
  const user = await User.findById(userId).select(CURRENT_USER_FIELDS);
  if (!user) return null;

  return toCurrentUserDto(user);
}

module.exports = { getClientIp, register, login, getMe };
