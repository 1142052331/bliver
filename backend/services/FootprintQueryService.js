const Footprint = require('../models/Footprint');
const User = require('../models/User');
const AppError = require('../middleware/AppError');
const { normalizeMapQuery } = require('../validators/mapQuery');
const { getFriendIds } = require('./SuperuserPolicy');
const { populateFootprint } = require('./footprint');
const { sanitizeLocation } = require('./location');
const { getUnreadByFootprintId } = require('./FootprintReadService');
const { id } = require('../policies/FootprintVisibilityPolicy');

function and(...conditions) {
  const values = conditions.filter((condition) => condition && Object.keys(condition).length > 0);
  if (values.length === 0) return {};
  if (values.length === 1) return values[0];
  return { $and: values };
}

function activePublicFilter(now) {
  return {
    $or: [
      { visibility: 'public', discoveryExpiresAt: { $gt: now } },
      { visibility: { $exists: false } },
    ],
  };
}

function authorizationFilter({ viewer, friendIds, now }) {
  if (viewer?.role === 'admin') return {};
  if (!viewer) return activePublicFilter(now);

  const branches = [
    { userId: viewer.id },
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

function relationshipFilter({ relationship, viewer, friendIds, now }) {
  if (relationship === 'self') return viewer ? { userId: viewer.id } : { _id: null };
  if (relationship === 'friends') {
    return friendIds.size > 0 ? { userId: { $in: [...friendIds] } } : { _id: null };
  }
  if (relationship === 'public') return activePublicFilter(now);
  return {};
}

function periodFilter(period, now) {
  if (period === '24h') return { createdAt: { $gte: new Date(+now - 24 * 60 * 60 * 1000) } };
  if (period === '7d') return { createdAt: { $gte: new Date(+now - 7 * 24 * 60 * 60 * 1000) } };
  return { createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } };
}

function contentFilter(content) {
  return content === 'photo' ? { photoUrl: { $nin: ['', null] } } : {};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textFilter(query, authorIds = []) {
  if (!query) return {};
  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, 'i');
  const branches = [{ placeName: regex }, { message: regex }];
  if (authorIds.length > 0) branches.push({ userId: { $in: authorIds } });
  return { $or: branches };
}

function fixedGeographyFilter(normalized) {
  if (normalized.scope === 'region') {
    return and(
      normalized.countryCode ? { countryCode: normalized.countryCode } : {},
      { regionCode: normalized.regionCode },
    );
  }
  if (normalized.scope === 'country') return { countryCode: normalized.countryCode };
  return {};
}

function buildCandidateFilters({ viewer, friendIds, normalized, now, authorIds = [] }) {
  const common = and(
    authorizationFilter({ viewer, friendIds, now }),
    relationshipFilter({ relationship: normalized.relationship, viewer, friendIds, now }),
    periodFilter(normalized.period, now),
    contentFilter(normalized.content),
    textFilter(normalized.query, authorIds),
  );

  if (normalized.scope !== 'smart') {
    return [and(common, fixedGeographyFilter(normalized))];
  }
  if (viewer?.role === 'admin') return [common];

  const viewerIds = viewer ? [viewer.id, ...friendIds] : [];
  const filters = [];
  if (viewerIds.length > 0) filters.push(and(common, { userId: { $in: viewerIds } }));

  const publicCandidate = and(
    common,
    activePublicFilter(now),
    viewerIds.length > 0 ? { userId: { $nin: viewerIds } } : {},
  );
  if (normalized.regionCode) {
    filters.push(and(
      publicCandidate,
      normalized.countryCode ? { countryCode: normalized.countryCode } : {},
      { regionCode: normalized.regionCode },
    ));
  }
  if (normalized.countryCode) {
    filters.push(and(
      publicCandidate,
      { countryCode: normalized.countryCode },
      normalized.regionCode ? { regionCode: { $ne: normalized.regionCode } } : {},
    ));
  }
  filters.push(and(
    publicCandidate,
    normalized.countryCode ? { countryCode: { $ne: normalized.countryCode } } : {},
  ));
  return filters;
}

function compareFootprints(left, right) {
  const time = new Date(right.createdAt) - new Date(left.createdAt);
  return time || id(right).localeCompare(id(left));
}

async function listCandidateLayers({ candidateFilters, limit, isAdmin }) {
  const byId = new Map();
  for (const filter of candidateFilters) {
    const remaining = limit - byId.size;
    if (remaining <= 0) break;
    const docs = await populateFootprint(
      Footprint.findSafe(filter, { isAdmin })
        .sort({ createdAt: -1, _id: -1 })
        .limit(remaining),
    );
    for (const doc of docs) byId.set(doc.id, doc);
  }
  return [...byId.values()].sort(compareFootprints);
}

function relationshipFor(footprint, viewer, friendIds) {
  const ownerId = id(footprint.userId);
  if (viewer && ownerId === id(viewer.id)) return 'self';
  if (friendIds.has(ownerId)) return 'friend';
  return 'stranger';
}

function sourceFor(footprint, relationship, normalized) {
  if (relationship === 'self') return { sourceScope: 'self', sourceLabel: '我的' };
  if (relationship === 'friend') return { sourceScope: 'friend', sourceLabel: '好友' };
  if (normalized.regionCode && footprint.regionCode === normalized.regionCode) {
    return { sourceScope: 'region', sourceLabel: '同省' };
  }
  if (normalized.countryCode && footprint.countryCode === normalized.countryCode) {
    return { sourceScope: 'country', sourceLabel: '同国' };
  }
  return { sourceScope: 'global', sourceLabel: '全球' };
}

function decorateMapFootprint(doc, { viewer, friendIds, normalized, unreadById }) {
  const plain = sanitizeLocation(doc.toObject(), viewer?.role === 'admin');
  const relationship = relationshipFor(plain, viewer, friendIds);
  return {
    ...plain,
    _id: id(plain),
    visibility: plain.visibility || 'public',
    relationship,
    ...sourceFor(plain, relationship, normalized),
    isUnread: unreadById.get(id(plain)) || false,
    canInteract: Boolean(viewer),
  };
}

async function listMap({ viewer, query, now = new Date() }) {
  const normalized = normalizeMapQuery(query || {});
  if (!viewer && normalized.content === 'unread') {
    throw new AppError(400, '登录后才能筛选未读足迹');
  }

  const friendIds = viewer ? await getFriendIds(viewer.id) : new Set();
  const authorIds = normalized.query
    ? (await User.find({ name: new RegExp(escapeRegex(normalized.query), 'i') })
      .select('_id').limit(50).lean()).map((user) => user._id)
    : [];
  const candidateFilters = buildCandidateFilters({
    viewer, friendIds, normalized, now, authorIds,
  });
  const docs = await listCandidateLayers({
    candidateFilters,
    limit: normalized.limit,
    isAdmin: viewer?.role === 'admin',
  });
  const unreadById = viewer
    ? await getUnreadByFootprintId({ viewerId: viewer.id, footprints: docs, now })
    : new Map();
  const footprints = docs
    .map((doc) => decorateMapFootprint(doc, { viewer, friendIds, normalized, unreadById }))
    .filter((footprint) => normalized.content !== 'unread' || footprint.isUnread);

  return {
    footprints,
    query: normalized,
    scopesUsed: [...new Set(footprints.map((footprint) => footprint.sourceScope))],
  };
}

async function searchAuthorized({ viewer, query, now = new Date() }) {
  if (!query?.query?.trim()) return [];
  return (await listMap({ viewer, query, now })).footprints;
}

module.exports = {
  activePublicFilter,
  buildCandidateFilters,
  decorateMapFootprint,
  listCandidateLayers,
  listMap,
  searchAuthorized,
};
