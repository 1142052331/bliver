const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['footprint', 'comment'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint', required: true },
  reason: {
    type: String,
    enum: ['spam', 'harassment', 'privacy', 'illegal', 'other'],
    required: true,
  },
  details: { type: String, default: '', maxlength: 500 },
  status: {
    type: String,
    enum: ['pending', 'actioned', 'dismissed'],
    default: 'pending',
  },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  resolution: { type: String, default: '', maxlength: 80 },
}, { timestamps: true });

reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_report_per_target',
  },
);
reportSchema.index({ status: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Report', reportSchema);
