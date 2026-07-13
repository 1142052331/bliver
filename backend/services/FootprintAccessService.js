const mongoose = require('mongoose');
const Footprint = require('../models/Footprint');
const { getFriendIds } = require('./SuperuserPolicy');
const { canReadFootprint } = require('../policies/FootprintVisibilityPolicy');
const Block = require('../models/Block');

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
  let blockedIds = new Set();
  if (viewer?.id) {
    const blocks = await Block.find({ $or: [{ blockerId: viewer.id }, { blockedId: viewer.id }] }).select('blockerId blockedId').lean();
    blockedIds = new Set(blocks.map((block) => String(block.blockerId) === String(viewer.id) ? String(block.blockedId) : String(block.blockerId)));
  }
  return {
    viewerId: viewer?.id || null,
    friendIds: viewer?.id ? await getFriendIds(viewer.id) : new Set(),
    blockedIds,
    isAdmin: viewer?.role === 'admin',
  };
}

function canReadWithAccess(footprint, access, now = new Date()) {
  const ownerId = footprint?.userId?._id || footprint?.userId;
  if (ownerId && access.blockedIds?.has(String(ownerId))) return false;
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
