function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || '';
}

function canReadFootprint({
  footprint,
  viewerId = null,
  friendIds = new Set(),
  isAdmin = false,
  now = new Date(),
}) {
  if (!footprint) return false;
  if (isAdmin) return true;

  const ownerId = id(footprint.userId);
  const currentViewerId = id(viewerId);
  if (currentViewerId && currentViewerId === ownerId) return true;

  if (!footprint.visibility) return true;
  if (footprint.visibility === 'private') return false;

  const isFriend = friendIds.has(ownerId);
  if (footprint.visibility === 'friends') return isFriend;
  if (footprint.visibility !== 'public') return false;
  if (isFriend) return true;

  const expiresAt = footprint.discoveryExpiresAt
    ? new Date(footprint.discoveryExpiresAt)
    : null;
  return Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt > now);
}

module.exports = { canReadFootprint, id };
