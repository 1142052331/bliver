const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pairKey: { type: String, required: true, unique: true, index: true },
  state: { type: String, enum: ['greeting_pending', 'unlocked'], default: 'greeting_pending' },
  pendingSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hiddenAtA: { type: Date, default: null },
  hiddenAtB: { type: Date, default: null },
  lastMessageAt: { type: Date, default: null, index: true },
  lastMessagePreview: { type: String, default: '' },
}, { timestamps: true });

conversationSchema.index({ userA: 1, userB: 1 }, { unique: true });

conversationSchema.statics.pairKeyFor = function pairKeyFor(first, second) {
  return [String(first), String(second)].sort().join(':');
};

module.exports = mongoose.model('Conversation', conversationSchema);
