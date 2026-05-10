const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:    { type: String, enum: ['pending', 'accepted'], default: 'pending' },
}, { timestamps: true });

// Prevent duplicate requests (either direction)
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
// Query pending requests + accepted friends (both directions)
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
