const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title:   { type: String, default: '' },
  content: { type: String, required: true },
  author:  { type: String, default: '阿森' },
}, { timestamps: true });

announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
