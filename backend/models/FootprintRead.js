const mongoose = require('mongoose');

const footprintReadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint', required: true },
  readAt: { type: Date, required: true },
}, { timestamps: true });

footprintReadSchema.index({ userId: 1, footprintId: 1 }, { unique: true });

module.exports = mongoose.model('FootprintRead', footprintReadSchema);
