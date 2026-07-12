const Footprint = require('../models/Footprint');
const { normalizeActivityQuery } = require('../validators/activityQuery');
const { id } = require('../policies/FootprintVisibilityPolicy');
const {
  activePublicFilter,
  authorizationFilter,
  canReadWithAccess,
  getViewerAccess,
} = require('./FootprintAccessService');
const { sanitizeLocation } = require('./location');
const { createBackfillDiscoveryWindowService } = require('./BackfillDiscoveryWindowService');
const {
  buildCursorFilter,
  decodeActivityCursor,
  encodeActivityCursor,
} = require('./ActivityCursor');

const SOURCE_ORDER = ['friend', 'region', 'country', 'global'];
const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_LABELS = {
  friend: '好友',
  region: '同省',
  country: '同国',
  global: '全球',
};
const NORMAL_INDEX_BY_SCOPE = {
  global: 'activity_normal_public_createdAt_id_expiry',
  country: 'activity_normal_country_createdAt_id_expiry',
  region: 'activity_normal_region_createdAt_id_expiry',
};
const BACKFILL_WINDOW_INDEX_BY_SCOPE = {
  global: 'activity_backfill_window_public_createdAt_id',
  country: 'activity_backfill_window_country_createdAt_id',
  region: 'activity_backfill_window_region_createdAt_id',
};
const backfillWindowService = createBackfillDiscoveryWindowService();

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

function discoveryTier({ scope, geography = {}, now }) {
  const publicationCutoff = new Date(now.getTime() - DAY_MS);
  return {
    scope,
    kind: 'discovery',
    hint: NORMAL_INDEX_BY_SCOPE[scope],
    normalHint: NORMAL_INDEX_BY_SCOPE[scope],
    filter: and(activePublicFilter(now), geography),
    // Publication writes guarantee expiry === createdAt + 24h, so this branch is exact.
    normalFilter: and(
      { visibility: 'public' },
      { discoveryOrigin: { $in: ['publication', null, ''] } },
      { createdAt: { $gt: publicationCutoff } },
      geography,
    ),
    legacyFilter: and({ visibility: { $in: [null, ''] } }, geography),
  };
}

function backfillWindowTiers({ scope, geography = {}, windows, cursorFilter }) {
  if (!windows.length) return [];
  return [{
    scope: 'global',
    kind: 'backfill',
    hint: BACKFILL_WINDOW_INDEX_BY_SCOPE[scope],
    filter: and(
      {
        visibility: 'public',
        discoveryOrigin: 'backfill',
        discoveryWindowToken: { $in: windows.map((window) => window.token) },
      },
      geography,
      cursorFilter,
    ),
  }];
}

function buildSmartTiers({ access, now }) {
  if (access.isAdmin) {
    return [{
      scope: 'global',
      hint: 'activity_createdAt_id',
      filter: authorizationFilter({ ...access, now }),
    }];
  }

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

  tiers.push({
    // Legacy-public visibility branches are rollout-only until mandatory backfill completes.
    ...discoveryTier({ scope: 'global', now }),
  });
  return tiers;
}

function buildCandidateTiers({ access, normalized, now, cursor, backfillWindows = [] }) {
  const cursorFilter = cursor ? buildCursorFilter(cursor) : {};
  if (normalized.scope === 'smart') {
    const tiers = buildSmartTiers({ access, now })
      .map((tier) => (tier.kind === 'discovery'
        ? {
          ...tier,
          filter: and(tier.filter, cursorFilter),
          normalFilter: and(tier.normalFilter, cursorFilter),
          legacyFilter: and(tier.legacyFilter, cursorFilter),
        }
        : { ...tier, filter: and(tier.filter, cursorFilter) }));
    if (!access.isAdmin) {
      tiers.push(...backfillWindowTiers({
        scope: 'global', windows: backfillWindows, cursorFilter,
      }));
    }
    return tiers;
  }
  if (!access.viewerId) {
    const tier = discoveryTier({
      scope: normalized.scope,
      geography: geographyFilter(normalized),
      now,
    });
    return [{
      ...tier,
      filter: and(tier.filter, cursorFilter),
      normalFilter: and(tier.normalFilter, cursorFilter),
      legacyFilter: and(tier.legacyFilter, cursorFilter),
    }, ...backfillWindowTiers({
      scope: normalized.scope,
      geography: geographyFilter(normalized),
      windows: backfillWindows,
      cursorFilter,
    })];
  }
  if (!access.isAdmin) {
    const geography = geographyFilter(normalized);
    const relatedIds = [access.viewerId, ...access.friendIds];
    const discovery = discoveryTier({ scope: normalized.scope, geography, now });
    return [
      {
        scope: 'friend',
        hint: 'userId_1_createdAt_-1__id_-1',
        filter: and(
          authorizationFilter({ ...access, now }),
          { userId: { $in: relatedIds } },
          geography,
          cursorFilter,
        ),
      },
      {
        ...discovery,
        filter: and(discovery.filter, cursorFilter),
        normalFilter: and(discovery.normalFilter, cursorFilter),
        legacyFilter: and(discovery.legacyFilter, cursorFilter),
      },
      ...backfillWindowTiers({
        scope: normalized.scope,
        geography,
        windows: backfillWindows,
        cursorFilter,
      }),
    ];
  }
  return [{
    scope: normalized.scope,
    hint: access.isAdmin ? 'activity_createdAt_id' : null,
    filter: and(
      authorizationFilter({ ...access, now }),
      geographyFilter(normalized),
      cursorFilter,
    ),
  }];
}

function buildDiscoveryPipeline(tier, limit, isAdmin) {
  const pipeline = [
    { $match: tier.normalFilter },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: limit },
    {
      $unionWith: {
        coll: Footprint.collection.name,
        pipeline: [
          { $match: tier.legacyFilter },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: limit },
        ],
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: limit },
  ];
  if (!isAdmin) pipeline.push({ $project: { realLocation: 0 } });
  return pipeline;
}

async function queryTier({ tier, limit, isAdmin }) {
  if (tier.kind !== 'discovery' && tier.kind !== 'backfill') {
    let query = Footprint.findSafe(tier.filter, { isAdmin, refreshNestedUsernames: false })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);
    if (tier.hint) query = query.hint(tier.hint);
    return query;
  }

  const pipeline = tier.kind === 'backfill'
    ? [
      { $match: tier.filter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: limit },
      ...(isAdmin ? [] : [{ $project: { realLocation: 0 } }]),
    ]
    : buildDiscoveryPipeline(tier, limit, isAdmin);
  return Footprint.aggregate(pipeline)
    .hint(tier.hint);
}

function compareFootprints(left, right) {
  const timestampDifference = new Date(right.createdAt) - new Date(left.createdAt);
  return timestampDifference || id(right).localeCompare(id(left));
}

async function queryCandidates({ tiers, perTierLimit, isAdmin }) {
  const candidates = new Map();
  const tierResults = await Promise.all(tiers.map((tier) => queryTier({
    tier, limit: perTierLimit, isAdmin,
  })));
  for (const docs of tierResults) {
    for (const doc of docs) {
      const footprintId = id(doc);
      if (!candidates.has(footprintId)) candidates.set(footprintId, doc);
    }
  }
  return [...candidates.values()];
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
  const plainDoc = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const sanitized = sanitizeLocation(plainDoc, access.isAdmin);
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
  const backfillWindows = access.isAdmin ? [] : await backfillWindowService.listActive(requestNow);
  const tiers = buildCandidateTiers({
    access, normalized, now: requestNow, cursor, backfillWindows,
  });
  const candidates = await queryCandidates({
    tiers,
    perTierLimit: normalized.limit + 1,
    isAdmin: access.isAdmin,
  });
  if (candidates.length > 0) {
    await Footprint.populate(candidates, {
      path: 'userId',
      select: 'name avatarUrl isOnline role checkinStreak',
    });
    if (typeof Footprint.refreshNestedUsernames === 'function') {
      await Footprint.refreshNestedUsernames(candidates);
    }
  }
  const readable = candidates
    .filter((doc) => canReadWithAccess(doc, access, requestNow))
    .sort(compareFootprints);
  const hasMore = readable.length > normalized.limit;
  const pageDocs = readable.slice(0, normalized.limit);
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
  buildDiscoveryPipeline,
  compareFootprints,
  listActivity,
};
