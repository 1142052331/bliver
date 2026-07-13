const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'login', 'register', 'delete', 'footprint_delete', 'kick', 'user_edit',
      'report_action', 'report_dismiss',
    ],
    required: true,
  },
  actor: { type: String, default: '' },
  target: { type: String, default: '' },
  detail: { type: String, default: '' },
  ip: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
