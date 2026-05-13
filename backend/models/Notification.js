const mongoose = require('mongoose');
const { resolveUserName } = require('../services/userNameCache');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderName:  { type: String, required: true },
  type:        { type: String, enum: ['reaction', 'comment', 'profile_view'], required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint' },
  content:     { type: String, required: true },
  isRead:      { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now },
});

// Post-find middleware: resolve senderName from senderId
async function resolveSenderNames(docs) {
  if (!docs) return;
  const arr = Array.isArray(docs) ? docs : [docs];
  for (const doc of arr) {
    if (doc?.senderId) {
      const resolved = await resolveUserName(doc.senderId);
      if (resolved && resolved !== 'Unknown') doc.senderName = resolved;
    }
  }
}

notificationSchema.post('find', resolveSenderNames);
notificationSchema.post('findOne', resolveSenderNames);

module.exports = mongoose.model('Notification', notificationSchema);
