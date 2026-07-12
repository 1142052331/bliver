const mongoose = require('mongoose');
const Footprint = require('../models/Footprint');
const { getFriendIds } = require('./SuperuserPolicy');
const { canReadFootprint } = require('../policies/FootprintVisibilityPolicy');

function activePublicFilter(now) {
  return {
    $or: [
      { visibility: 'public', discoveryExpiresAt: { $gt: now } },
      { visibility: null },
      { visibility: '' },
    ],
  };
}

function authorizationFilter({ viewerId = null, friendIds = new Set(), isAdmin = false, now = new Date() }) {
  if (isAdmin) return {};
  if (!viewerId) return activePublicFilter(now);

  const branches = [
    { userId: viewerId },
    activePublicFilter(now),
  ];
  if (friendIds.size > 0) {
    branches.push({
      userId: { $in: [...friendIds] },
      visibility: { $in: ['public', 'friends'] },
    });
  }
  return { $or: branches };
}

async function getViewerAccess(viewer) {
  return {
    viewerId: viewer?.id || null,
    friendIds: viewer?.id ? await getFriendIds(viewer.id) : new Set(),
    isAdmin: viewer?.role === 'admin',
  };
}

function canReadWithAccess(footprint, access, now = new Date()) {
  return canReadFootprint({ footprint, ...access, now });
}

async function filterReadableFootprints({ viewer, access, footprints, now = new Date() }) {
  const resolvedAccess = access || await getViewerAccess(viewer);
  return footprints.filter((footprint) => canReadWithAccess(footprint, resolvedAccess, now));
}

async function getReadableFootprint({ viewer, footprintId, now = new Date() }) {
  if (!mongoose.Types.ObjectId.isValid(footprintId)) return null;
  const footprint = await Footprint.findById(footprintId);
  if (!footprint) return null;
  const access = await getViewerAccess(viewer);
  return canReadWithAccess(footprint, access, now) ? footprint : null;
}

module.exports = {
  activePublicFilter,
  authorizationFilter,
  canReadWithAccess,
  filterReadableFootprints,
  getReadableFootprint,
  getViewerAccess,
};
