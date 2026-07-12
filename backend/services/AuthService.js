const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { isSuperuserName } = require('./authorization');
const bus = require('../events/bus');
const AppError = require('../middleware/AppError');

const CURRENT_USER_FIELDS = 'name avatarUrl profileBannerUrl role lastFootprintVisibility';

function toCurrentUserDto(user) {
  const id = String(user._id);
  return {
    _id: id,
    id,
    name: user.name,
    avatarUrl: user.avatarUrl || '',
    profileBannerUrl: user.profileBannerUrl || '',
    role: user.role,
    lastFootprintVisibility: user.lastFootprintVisibility || 'public',
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

async function register({ name, password, avatarUrl, ip }) {
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

  const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  return { user: toCurrentUserDto(user), token };
}

async function login(name, password, ip) {
  const user = await User.findOne({ name });

  const hash = user?.password || '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const match = await bcrypt.compare(password || '', hash);

  if (!user || !match) throw new AppError(400, 'Invalid credentials');

  const now = new Date();
  if (isSuperuserName(user.name) && user.role !== 'admin') {
    user.role = 'admin';
  }

  user.lastLoginIp = ip;
  user.lastLoginAt = now;
  if (user.role === 'admin' && isSuperuserName(user.name)) {
    await user.save();
  } else {
    await User.findByIdAndUpdate(user._id, { lastLoginIp: ip, lastLoginAt: now });
  }

  const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  return { user: toCurrentUserDto(user), token };
}

async function getMe(userId) {
  const user = await User.findById(userId).select(CURRENT_USER_FIELDS);
  if (!user) return null;

  if (isSuperuserName(user.name) && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }

  return toCurrentUserDto(user);
}

module.exports = { getClientIp, register, login, getMe };
