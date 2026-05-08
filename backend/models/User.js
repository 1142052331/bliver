const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatarUrl:{ type: String, default: '' },
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
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
