const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderName:  { type: String, required: true },
  type:        { type: String, enum: ['reaction', 'comment'], required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint', required: true },
  content:     { type: String, required: true },
  isRead:      { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);
