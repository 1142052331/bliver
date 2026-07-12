const Footprint = require('../models/Footprint');
const { normalizeActivityQuery } = require('../validators/activityQuery');
const { id } = require('../policies/FootprintVisibilityPolicy');
const {
  activePublicFilter,
  authorizationFilter,
  canReadWithAccess,
  getViewerAccess,
} = require('./FootprintAccessService');
const { populateFootprint } = require('./footprint');
const { sanitizeLocation } = require('./location');
const {
  buildCursorFilter,
  decodeActivityCursor,
  encodeActivityCursor,
} = require('./ActivityCursor');

const SOURCE_ORDER = ['friend', 'region', 'country', 'global'];
const SOURCE_LABELS = {
  friend: '好友',
  region: '同省',
  country: '同国',
  global: '全球',
};
const PUBLIC_INDEX_BY_SCOPE = {
  global: 'activity_public_createdAt_id_expiry',
  country: 'activity_country_public_createdAt_id_expiry',
  region: 'activity_region_public_createdAt_id_expiry',
};

function and(...conditions) {
  const values = conditions.filter((condition) => condition && Object.keys(condition).length > 0);
  if (values.length === 0) return {};
  if (values.length === 1) return values[0];
  return { $and: values };
}

function geographyFilter(normalized) {
  if (normalized.scope === 'region') {
    return { countryCode: normalized.countryCode, regionCode: normalized.regionCode };
  }
  if (normalized.scope === 'country') return { countryCode: normalized.countryCode };
  return {};
}

function buildSmartTiers({ access, normalized, now }) {
  const relatedIds = access.viewerId
    ? [access.viewerId, ...access.friendIds]
    : [];
  const tiers = [];

  if (relatedIds.length > 0) {
    tiers.push({
      scope: 'friend',
      hint: 'userId_1_createdAt_-1__id_-1',
      filter: and(
        authorizationFilter({ ...access, now }),
        { userId: { $in: relatedIds } },
      ),
    });
  }

  const authorizedDiscovery = access.isAdmin
    ? authorizationFilter({ ...access, now })
    : activePublicFilter(now);
  const unrelated = relatedIds.length > 0 ? { userId: { $nin: relatedIds } } : {};
  const discoveryHint = (scope) => (access.isAdmin
    ? 'activity_createdAt_id'
    : PUBLIC_INDEX_BY_SCOPE[scope]);

  if (normalized.regionCode) {
    tiers.push({
      scope: 'region',
      hint: discoveryHint('region'),
      filter: and(
        authorizedDiscovery,
        unrelated,
        { countryCode: normalized.countryCode, regionCode: normalized.regionCode },
      ),
    });
  }
  if (normalized.countryCode) {
    tiers.push({
      scope: 'country',
      hint: discoveryHint('country'),
      filter: and(
        authorizedDiscovery,
        unrelated,
        { countryCode: normalized.countryCode },
        normalized.regionCode ? { regionCode: { $ne: normalized.regionCode } } : {},
      ),
    });
  }
  tiers.push({
    scope: 'global',
    hint: discoveryHint('global'),
    filter: and(
      authorizedDiscovery,
      unrelated,
      normalized.countryCode ? { countryCode: { $ne: normalized.countryCode } } : {},
    ),
  });
  return tiers;
}

function buildCandidateTiers({ access, normalized, now, cursor }) {
  const cursorFilter = cursor ? buildCursorFilter(cursor) : {};
  if (normalized.scope === 'smart') {
    return buildSmartTiers({ access, normalized, now })
      .map((tier) => ({ ...tier, filter: and(tier.filter, cursorFilter) }));
  }
  return [{
    scope: normalized.scope,
    hint: !access.viewerId
      ? PUBLIC_INDEX_BY_SCOPE[normalized.scope]
      : (access.isAdmin ? 'activity_createdAt_id' : null),
    filter: and(
      authorizationFilter({ ...access, now }),
      geographyFilter(normalized),
      cursorFilter,
    ),
  }];
}

function compareFootprints(left, right) {
  const timestampDifference = new Date(right.createdAt) - new Date(left.createdAt);
  return timestampDifference || id(right).localeCompare(id(left));
}

async function queryCandidates({ tiers, target, isAdmin }) {
  const candidates = new Map();
  let hasMore = false;
  for (const tier of tiers) {
    const remaining = target - candidates.size;
    let query = Footprint.findSafe(tier.filter, { isAdmin })
      .sort({ createdAt: -1, _id: -1 })
      .limit(remaining + 1);
    if (tier.hint) query = query.hint(tier.hint);
    const docs = await populateFootprint(query);
    for (const doc of docs) {
      const footprintId = id(doc);
      if (candidates.has(footprintId)) continue;
      if (candidates.size === target) {
        hasMore = true;
        break;
      }
      candidates.set(footprintId, doc);
    }
    if (hasMore) break;
  }
  return { candidates: [...candidates.values()], hasMore };
}

function relationshipFor(footprint, access) {
  const ownerId = id(footprint.userId);
  if (access.viewerId && ownerId === id(access.viewerId)) return 'self';
  if (access.friendIds.has(ownerId)) return 'friend';
  return 'stranger';
}

function sourceScopeFor(footprint, relationship, normalized) {
  if (relationship === 'self' || relationship === 'friend') return 'friend';
  if (normalized.regionCode
    && footprint.countryCode === normalized.countryCode
    && footprint.regionCode === normalized.regionCode) return 'region';
  if (normalized.countryCode && footprint.countryCode === normalized.countryCode) return 'country';
  return 'global';
}

function decorateActivityFootprint(doc, { access, normalized }) {
  const sanitized = sanitizeLocation(doc.toObject(), access.isAdmin);
  const { regionBackfill, ...plain } = sanitized;
  const relationship = relationshipFor(plain, access);
  const sourceScope = sourceScopeFor(plain, relationship, normalized);
  return {
    ...plain,
    _id: id(plain),
    visibility: plain.visibility || 'public',
    relationship,
    sourceScope,
    sourceLabel: SOURCE_LABELS[sourceScope],
    canInteract: Boolean(access.viewerId),
  };
}

async function listActivity({ viewer, query, now = new Date() }) {
  const requestNow = new Date(now);
  const normalized = normalizeActivityQuery(query || {});
  const cursor = normalized.cursor ? decodeActivityCursor(normalized.cursor) : null;
  const access = await getViewerAccess(viewer);
  const tiers = buildCandidateTiers({ access, normalized, now: requestNow, cursor });
  const selection = await queryCandidates({
    tiers,
    target: normalized.limit,
    isAdmin: access.isAdmin,
  });
  const readable = selection.candidates
    .filter((doc) => canReadWithAccess(doc, access, requestNow))
    .sort(compareFootprints);
  const hasMore = selection.hasMore;
  const pageDocs = readable;
  const items = pageDocs.map((doc) => decorateActivityFootprint(doc, { access, normalized }));
  const sourceSet = new Set(items.map((item) => item.sourceScope));

  return {
    items,
    nextCursor: hasMore ? encodeActivityCursor(pageDocs[pageDocs.length - 1]) : null,
    hasMore,
    scope: normalized.scope,
    usedScopes: SOURCE_ORDER.filter((scope) => sourceSet.has(scope)),
    location: {
      countryCode: normalized.countryCode || null,
      regionCode: normalized.regionCode || null,
    },
  };
}

module.exports = {
  buildCandidateTiers,
  compareFootprints,
  listActivity,
};
