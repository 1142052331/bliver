const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:    { type: String, required: true },
  isRead:     { type: Boolean, default: false },
}, { timestamps: true });

// Chat history: fetch messages between two users
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
// Unread count
messageSchema.index({ receiverId: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);
