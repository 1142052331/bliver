const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatarUrl:{ type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
