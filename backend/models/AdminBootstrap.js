const mongoose = require('mongoose');

const ADMIN_BOOTSTRAP_KEY = 'admin-setup';

const adminBootstrapSchema = new mongoose.Schema({
  _id: { type: String, default: ADMIN_BOOTSTRAP_KEY },
  key: {
    type: String,
    enum: [ADMIN_BOOTSTRAP_KEY],
    default: ADMIN_BOOTSTRAP_KEY,
    required: true,
    immutable: true,
    unique: true,
  },
  state: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerToken: { type: String, required: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

const AdminBootstrap = mongoose.model('AdminBootstrap', adminBootstrapSchema);

module.exports = AdminBootstrap;
module.exports.ADMIN_BOOTSTRAP_KEY = ADMIN_BOOTSTRAP_KEY;
