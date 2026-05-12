const mongoose = require('mongoose');
const { SUPERUSER_NAME } = require('../services/superuser');

const announcementSchema = new mongoose.Schema({
  title:   { type: String, default: '' },
  content: { type: String, required: true },
  author:  { type: String, default: SUPERUSER_NAME },
}, { timestamps: true });

announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
