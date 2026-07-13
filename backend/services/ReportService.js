const mongoose = require('mongoose');
const Report = require('../models/Report');
const AppError = require('../middleware/AppError');
const auditService = require('./AuditService');
const footprintService = require('./FootprintService');
const { getReadableFootprint } = require('./FootprintAccessService');

function isSameId(left, right) {
  return String(left || '') === String(right || '');
}

async function resolveTarget({ viewer, targetType, targetId, footprintId }) {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new AppError(404, 'Report target not found');
  }
  const effectiveFootprintId = targetType === 'footprint' ? targetId : footprintId;
  if (!mongoose.Types.ObjectId.isValid(effectiveFootprintId)) {
    throw new AppError(404, 'Report target not found');
  }

  const footprint = await getReadableFootprint({ viewer, footprintId: effectiveFootprintId });
  if (!footprint) throw new AppError(404, 'Report target not found');

  if (targetType === 'footprint') {
    return { footprint, ownerId: footprint.userId, footprintId: footprint._id };
  }

  const comment = footprint.comments.id(targetId);
  if (!comment || comment.isDeleted) throw new AppError(404, 'Report target not found');
  return { footprint, comment, ownerId: comment.userId, footprintId: footprint._id };
}

async function submit({ viewer, targetType, targetId, footprintId, reason, details = '' }) {
  const target = await resolveTarget({ viewer, targetType, targetId, footprintId });
  if (isSameId(target.ownerId, viewer.id)) {
    throw new AppError(400, 'Cannot report your own content');
  }

  const filter = {
    reporterId: viewer.id,
    targetType,
    targetId,
    status: 'pending',
  };
  const existing = await Report.findOne(filter);
  if (existing) return { report: existing, created: false };

  try {
    const report = await Report.create({
      reporterId: viewer.id,
      targetType,
      targetId,
      footprintId: target.footprintId,
      reason,
      details,
    });
    return { report, created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const report = await Report.findOne(filter);
    return { report, created: false };
  }
}

async function listPending({ limit = 100 } = {}) {
  return Report.find({ status: 'pending' })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 200))
    .populate('reporterId', 'name avatarUrl')
    .populate('footprintId', 'message placeName userId createdAt')
    .lean();
}

async function resolve({ reportId, reviewer, resolution }) {
  if (!['dismiss', 'delete'].includes(resolution)) {
    throw new AppError(400, 'Invalid report resolution');
  }
  const report = await Report.findOne({ _id: reportId, status: 'pending' });
  if (!report) throw new AppError(404, 'Pending report not found');

  if (resolution === 'delete') {
    if (report.targetType === 'footprint') {
      await footprintService.delete(report.footprintId, reviewer.name);
    } else {
      await footprintService.deleteComment(
        report.footprintId,
        report.targetId,
        reviewer.id,
        reviewer.name,
        { viewer: reviewer },
      );
    }
  }

  report.status = resolution === 'delete' ? 'actioned' : 'dismissed';
  report.reviewerId = reviewer.id;
  report.reviewedAt = new Date();
  report.resolution = resolution;
  await report.save();
  await auditService.log({
    type: resolution === 'delete' ? 'report_action' : 'report_dismiss',
    actor: reviewer.name,
    target: String(report.targetId),
    detail: `${report.targetType}:${report.reason}`,
  });

  return { report };
}

module.exports = { submit, listPending, resolve, resolveTarget };
