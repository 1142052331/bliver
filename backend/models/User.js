const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatarUrl:{ type: String, default: '' },
  profileBannerUrl: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  profileComments: [{
    senderName: { type: String, required: true },
    content:    { type: String, required: true },
    createdAt:  { type: Date, default: Date.now },
  }],
  profileReactions: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji:    { type: String, required: true },
  }],
  checkinStreak: {
    current:        { type: Number, default: 0 },
    lastCheckinDate: Date,
  },
  profileVisitors: [{
    visitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visitedAt: { type: Date, default: Date.now },
  }],
  registerIp:  { type: String, default: '', index: true },
  lastLoginIp: { type: String, default: '', index: true },
  lastLoginAt: { type: Date, default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
