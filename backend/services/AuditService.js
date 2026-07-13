const AuditLog = require('../models/AuditLog');

const AUDIT_TYPES = [
  'login', 'register', 'delete', 'footprint_delete', 'kick', 'user_edit',
  'report_action', 'report_dismiss', 'admin_setup',
];

/**
 * Write a meaningful admin audit event to MongoDB.
 * Low-value events (connect, disconnect, checkin, reaction, comment)
 * are excluded — they create noise with no actionable insight.
 */
async function log({ type, actor, target, detail, ip }) {
  if (!AUDIT_TYPES.includes(type)) return;
  return AuditLog.create({ type, actor: actor || '', target: target || '', detail: detail || '', ip: ip || '' });
}

/**
 * Query audit logs, newest first.
 */
async function query({ limit = 100, before } = {}) {
  const filter = {};
  if (before) filter._id = { $lt: before };
  const docs = await AuditLog.find(filter).sort({ _id: -1 }).limit(limit).lean();
  return docs;
}

module.exports = { log, query, AUDIT_TYPES };
