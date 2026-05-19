const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating:  { type: Number, min: 1, max: 5, required: true },
  content: { type: String, default: '' },
}, { timestamps: true });

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
