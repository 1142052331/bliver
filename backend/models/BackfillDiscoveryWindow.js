const mongoose = require('mongoose');

const backfillDiscoveryWindowSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, maxlength: 128 },
  slot: {
    type: Number,
    min: 0,
    max: 31,
    validate: {
      validator: Number.isInteger,
      message: 'slot must be an integer from 0 through 31',
    },
    unique: true,
    sparse: true,
  },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

backfillDiscoveryWindowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BackfillDiscoveryWindow', backfillDiscoveryWindowSchema);
