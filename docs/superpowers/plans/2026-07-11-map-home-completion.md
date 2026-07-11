# Map Home Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Natural City map home with shared authorized querying, unified search, geographic scope, filters, relationship-aware markers, zoom-first clustering, independent tile/data states, and production browser verification.

**Architecture:** Phase 2 establishes the shared footprint visibility and query foundations that later Activity, detail, publishing, messaging, and profile phases must reuse. The backend owns authorization and response decoration; React Query owns server state; URL state owns shareable map controls; Zustand remains limited to transient selection and sheet state.

**Tech Stack:** Express 5, Mongoose 9, Jest 30, Supertest, React 19, React Query 5, Zustand 5, React Leaflet 5, Leaflet MarkerCluster, Tailwind CSS 4, Vitest 4, Testing Library, Lucide React.

---

## File Structure

**Backend shared foundation**

- Create `backend/policies/FootprintVisibilityPolicy.js`: one viewer/footprint authorization policy.
- Create `backend/models/FootprintRead.js`: one authoritative `userId + footprintId + readAt` record.
- Create `backend/services/FootprintReadService.js`: read-baseline, unread decoration, mark-read, and bounded legacy import.
- Create `backend/services/FootprintQueryService.js`: normalize map query inputs, build authorized queries, decorate source metadata.
- Create `backend/routes/map.js`: `GET /api/map/footprints` and `GET /api/map/search`.
- Create `backend/validators/mapQuery.js`: bounded scope/filter/search validation.
- Modify `backend/models/Footprint.js`: add the visibility/geography fields required by the shared query contract.
- Modify `backend/models/User.js`: add `footprintReadBaselineAt` for first-use unread seeding.
- Modify `backend/routes/api.js`: mount the map router before `/:id` footprint routes.
- Create `backend/__tests__/footprint-visibility-policy.test.js`.
- Create `backend/__tests__/footprint-read.test.js`.
- Create `backend/__tests__/map-query.test.js`.

**Frontend shared map state**

- Create `frontend/src/domain/mapQuery.ts`: query vocabulary, defaults, URL parse/serialize.
- Create `frontend/src/hooks/useMapFootprints.js`: React Query wrapper for the authorized map endpoint.
- Create `frontend/src/hooks/useLocationContext.js`: permission state, resolved scope, seven-day reminder cooldown.
- Create `frontend/src/hooks/useLegacyReadImport.js`: one-time bridge from local read timestamps to the server.
- Create `frontend/src/components/map/MapSearch.jsx`: debounced grouped place/footprint search.
- Create `frontend/src/components/map/MapScopeControl.jsx`: smart/region/country/global control.
- Create `frontend/src/components/map/MapFilterSheet.jsx`: relationship/time/content filter sheet.
- Create `frontend/src/components/map/MapStatusNotice.jsx`: independent data/tile/location notices.
- Create `frontend/src/components/map/SamePlaceSheet.jsx`: Natural City cluster fallback sheet.
- Modify `frontend/src/components/MapHomeControls.jsx`: compose search, scope, filters, locate, reset.
- Modify `frontend/src/components/ClusterMarkers.jsx`: source treatment, one-time pulse, zoom-first clusters.
- Modify `frontend/src/components/MapView.jsx`: tile events, map control callbacks, selection lifecycle.
- Modify `frontend/src/components/MapPreviewCard.jsx`: source label, image fallback, deterministic close.
- Modify `frontend/src/components/FootprintDetailModal.jsx`: mark a footprint read through the authoritative API.
- Modify `frontend/src/readStatus.js`: retain only the bounded one-time legacy import adapter.
- Modify `frontend/src/App.jsx`: switch map data to `useMapFootprints` and shared URL state.
- Modify `frontend/src/store/useUIStore.ts`: same-place sheet state only; no footprint arrays.
- Modify `frontend/src/styles/tokens.css`: semantic map classes and responsive composition.

**Frontend tests**

- Create `frontend/src/domain/__tests__/mapQuery.test.ts`.
- Create `frontend/src/hooks/__tests__/useLocationContext.test.jsx`.
- Create `frontend/src/hooks/__tests__/useLegacyReadImport.test.jsx`.
- Create `frontend/src/components/map/__tests__/MapSearch.test.jsx`.
- Create `frontend/src/components/map/__tests__/MapFilterSheet.test.jsx`.
- Create `frontend/src/components/map/__tests__/SamePlaceSheet.test.jsx`.
- Create `frontend/src/components/__tests__/ClusterMarkers.test.jsx`.
- Create `frontend/src/components/__tests__/MapView.test.jsx`.
- Extend `frontend/src/components/__tests__/MapPreviewCard.test.jsx`.
- Extend `frontend/src/components/__tests__/FootprintDetailModal.test.jsx`.
- Extend `frontend/src/__tests__/App.mobile-shell.test.jsx`.

---

### Task 1: Lock the Existing Partial Phase 2 Behavior

**Files:**
- Modify: `frontend/src/components/__tests__/MapPreviewCard.test.jsx`
- Create: `frontend/src/components/__tests__/MapHomeControls.test.jsx`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx`
- Commit existing partial files: `frontend/src/App.jsx`, `frontend/src/components/ClusterMarkers.jsx`, `frontend/src/components/MapView.jsx`, `frontend/src/components/MapHomeControls.jsx`, `frontend/src/components/MapPreviewCard.jsx`, `frontend/src/store/useUIStore.ts`, `frontend/src/styles/tokens.css`

- [ ] **Step 1: Add failing integration assertions for preview wiring and map query states**

Add a `MapPreviewCard` mock that captures its props and assert that App passes the selected footprint, closes through `setMapPreviewId(null)`, and opens detail through `setFlyArrivedFp`.

```jsx
const mapPreviewProps = vi.fn();
vi.mock('../components/MapPreviewCard', () => ({
  default: (props) => {
    mapPreviewProps(props);
    return props.footprint ? <button onClick={props.onOpenDetail}>Open selected footprint</button> : null;
  },
}));

it('routes a selected map footprint through preview before detail', async () => {
  const selected = { _id: 'fp-1', userId: { _id: 'u-1' } };
  mocks.footprints = [selected];
  uiState.mapPreviewId = 'fp-1';
  render(<App />);
  expect(mapPreviewProps).toHaveBeenLastCalledWith(expect.objectContaining({ footprint: selected }));
  await userEvent.click(screen.getByRole('button', { name: 'Open selected footprint' }));
  expect(uiState.setFlyArrivedFp).toHaveBeenCalledWith(selected);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test --prefix frontend -- App.mobile-shell.test.jsx MapHomeControls.test.jsx MapPreviewCard.test.jsx`

Expected: FAIL because the App test mocks do not yet expose `mapPreviewId`, `setMapPreviewId`, or map error props consistently.

- [ ] **Step 3: Complete the test fixtures without changing production behavior**

Add `mapPreviewId`, `setMapPreviewId`, and a configurable `mocks.footprints` result to the App fixture. Test `MapHomeControls` locate unavailable, locate rejected, and reset callbacks by mocking `useMap()`.

- [ ] **Step 4: Run focused and full frontend verification**

Run: `npm.cmd test --prefix frontend -- App.mobile-shell.test.jsx MapHomeControls.test.jsx MapPreviewCard.test.jsx`

Expected: all focused tests PASS.

Run: `npm.cmd test --prefix frontend`

Expected: all frontend tests PASS.

- [ ] **Step 5: Commit the partial Phase 2 baseline**

```powershell
git add frontend/src/App.jsx frontend/src/components/ClusterMarkers.jsx frontend/src/components/MapView.jsx frontend/src/components/MapHomeControls.jsx frontend/src/components/MapPreviewCard.jsx frontend/src/components/__tests__/MapHomeControls.test.jsx frontend/src/components/__tests__/MapPreviewCard.test.jsx frontend/src/__tests__/App.mobile-shell.test.jsx frontend/src/store/useUIStore.ts frontend/src/styles/tokens.css
git commit -m "feat: establish natural city map preview baseline"
```

### Task 2: Add the Shared Visibility Policy Foundation

**Files:**
- Modify: `backend/models/Footprint.js`
- Create: `backend/policies/FootprintVisibilityPolicy.js`
- Create: `backend/__tests__/footprint-visibility-policy.test.js`

- [ ] **Step 1: Write failing policy tests**

```js
const { canReadFootprint } = require('../policies/FootprintVisibilityPolicy');

describe('canReadFootprint', () => {
  const activePublic = { userId: 'owner', visibility: 'public', discoveryExpiresAt: new Date(Date.now() + 60_000) };

  test('allows guests to read active public footprints', () => {
    expect(canReadFootprint({ footprint: activePublic, viewerId: null, friendIds: new Set(), now: new Date() })).toBe(true);
  });

  test('denies strangers after public discovery expires', () => {
    const expired = { ...activePublic, discoveryExpiresAt: new Date(Date.now() - 1) };
    expect(canReadFootprint({ footprint: expired, viewerId: 'stranger', friendIds: new Set(), now: new Date() })).toBe(false);
  });

  test.each(['friends', 'private'])('denies guests for %s visibility', (visibility) => {
    expect(canReadFootprint({ footprint: { ...activePublic, visibility }, viewerId: null, friendIds: new Set(), now: new Date() })).toBe(false);
  });
});
```

- [ ] **Step 2: Run policy tests and verify RED**

Run: `npm.cmd test --prefix backend -- footprint-visibility-policy.test.js`

Expected: FAIL with module-not-found for `FootprintVisibilityPolicy`.

- [ ] **Step 3: Implement the minimum pure policy**

```js
function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || '';
}

function canReadFootprint({ footprint, viewerId, friendIds = new Set(), now = new Date() }) {
  const ownerId = id(footprint.userId);
  const currentViewerId = id(viewerId);
  if (currentViewerId && currentViewerId === ownerId) return true;
  if (footprint.visibility === 'private') return false;
  if (footprint.visibility === 'friends') return friendIds.has(ownerId);
  if (footprint.visibility === 'public') {
    if (friendIds.has(ownerId)) return true;
    return footprint.discoveryExpiresAt && new Date(footprint.discoveryExpiresAt) > now;
  }
  return true; // Temporary legacy compatibility until the approved backfill completes.
}

module.exports = { canReadFootprint };
```

Add the fields and indexes below. `visibility` remains optional during Phase 2 because the approved Phase 3+5 backfill makes it required only after every legacy document has been processed.

```js
visibility: { type: String, enum: ['public', 'friends', 'private'] },
locationPrecision: { type: String, enum: ['approximate', 'precise'], default: 'approximate' },
countryCode: { type: String, default: '', index: true },
countryName: { type: String, default: '' },
regionCode: { type: String, default: '', index: true },
regionName: { type: String, default: '' },
discoveryExpiresAt: { type: Date, default: null },
regionBackfill: {
  status: { type: String, enum: ['pending', 'processing', 'complete', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: null },
  error: { type: String, default: '', maxlength: 240 },
},
```

```js
footprintSchema.index({ visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ countryCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ countryCode: 1, regionCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ userId: 1, createdAt: -1, _id: -1 });
```

- [ ] **Step 4: Run backend policy tests**

Run: `npm.cmd test --prefix backend -- footprint-visibility-policy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/models/Footprint.js backend/policies/FootprintVisibilityPolicy.js backend/__tests__/footprint-visibility-policy.test.js
git commit -m "feat: add shared footprint visibility policy"
```

### Task 3: Add Server-Authoritative Footprint Read State

**Files:**
- Create: `backend/models/FootprintRead.js`
- Modify: `backend/models/User.js`
- Create: `backend/services/FootprintReadService.js`
- Modify: `backend/routes/api.js`
- Create: `backend/__tests__/footprint-read.test.js`

- [ ] **Step 1: Write failing unread-semantics tests**

Use fixed timestamps. Cover an existing footprint at first-use baseline, another user's new footprint inside seven days, an eight-day-old footprint, a new comment after `readAt`, and the owner's newly published footprint.

```js
const NOW = new Date('2026-07-11T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const { isFootprintUnread } = require('../services/FootprintReadService');

test.each([
  ['baseline makes existing content read', { createdAt: new Date(+NOW - DAY) }, NOW, null, false],
  ['new stranger footprint is unread', { createdAt: new Date(+NOW - DAY) }, new Date(+NOW - 2 * DAY), null, true],
  ['old footprint ages out of new state', { createdAt: new Date(+NOW - 8 * DAY) }, new Date(+NOW - 10 * DAY), null, false],
  ['comment after read is unread', { createdAt: new Date(+NOW - 8 * DAY), comments: [{ createdAt: NOW }] }, new Date(+NOW - DAY), new Date(+NOW - DAY), true],
])('%s', (_name, footprint, baselineAt, readAt, expected) => {
  expect(isFootprintUnread({ footprint, viewerId: 'viewer', baselineAt, readAt, now: NOW })).toBe(expected);
});

test('does not call an owner\'s newly published footprint unread', () => {
  expect(isFootprintUnread({
    footprint: { userId: 'viewer', createdAt: NOW, comments: [] },
    viewerId: 'viewer', baselineAt: new Date(+NOW - DAY), readAt: null, now: NOW,
  })).toBe(false);
});
```

- [ ] **Step 2: Run the read-state test and verify RED**

Run: `npm.cmd test --prefix backend -- footprint-read.test.js`

Expected: FAIL with module-not-found for `FootprintReadService`.

- [ ] **Step 3: Add the read model and user baseline**

```js
const mongoose = require('mongoose');

const footprintReadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint', required: true },
  readAt: { type: Date, required: true },
}, { timestamps: true });

footprintReadSchema.index({ userId: 1, footprintId: 1 }, { unique: true });
module.exports = mongoose.model('FootprintRead', footprintReadSchema);
```

Add this field to `User`:

```js
footprintReadBaselineAt: { type: Date, default: null },
```

- [ ] **Step 4: Implement baseline and unread decoration**

`ensureReadBaseline(userId, now)` atomically sets a missing `User.footprintReadBaselineAt` and returns the persisted value. `getUnreadByFootprintId({ viewerId, footprints, now })` loads all matching `FootprintRead` rows in one query and returns a `Map<string, boolean>`. Use this pure decision function:

```js
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || '';
}

function isFootprintUnread({ footprint, viewerId, baselineAt, readAt, now = new Date() }) {
  const effectiveReadAt = readAt ? new Date(readAt) : new Date(baselineAt);
  const latestCommentAt = (footprint.comments || []).reduce((latest, comment) => {
    const value = new Date(comment.createdAt || 0);
    return value > latest ? value : latest;
  }, new Date(0));
  if (latestCommentAt > effectiveReadAt) return true;
  if (id(footprint.userId) === id(viewerId)) return false;
  const createdAt = new Date(footprint.createdAt);
  return createdAt > effectiveReadAt && now - createdAt < SEVEN_DAYS_MS;
}
```

- [ ] **Step 5: Add mark-read and bounded legacy-import tests**

Assert `markRead` uses `{ userId, footprintId }` with `$max: { readAt }`, rejects a footprint the shared policy denies, import rejects more than 500 entries, and import ignores invalid or unreadable footprint IDs without revealing which hidden IDs exist.

- [ ] **Step 6: Implement authenticated read endpoints**

Mount these routes before `GET /footprints/:id`:

```js
router.put('/footprints/:id/read', auth, async (req, res) => {
  await footprintReadService.markRead({ viewer: req.user, footprintId: req.params.id });
  res.json({ ok: true });
});

router.post('/footprints/read-state/import', auth, async (req, res) => {
  const result = await footprintReadService.importLegacy({ viewer: req.user, entries: req.body.entries });
  res.json(result);
});
```

`importLegacy` accepts at most 500 `{ footprintId, readAt }` entries, clamps future timestamps to server time, authorizes each footprint through `FootprintVisibilityPolicy`, and upserts with `$max` so replay is idempotent. It returns only `{ imported, skipped }` totals.

- [ ] **Step 7: Run backend tests and commit**

Run: `npm.cmd test --prefix backend -- footprint-read.test.js footprint-visibility-policy.test.js`

Expected: PASS.

```powershell
git add backend/models/FootprintRead.js backend/models/User.js backend/services/FootprintReadService.js backend/routes/api.js backend/__tests__/footprint-read.test.js
git commit -m "feat: add authoritative footprint read state"
```

### Task 4: Build the Authorized Map Query Service

**Files:**
- Create: `backend/validators/mapQuery.js`
- Create: `backend/services/FootprintQueryService.js`
- Create: `backend/routes/map.js`
- Modify: `backend/services/nominatim.js`
- Modify: `backend/routes/api.js`
- Create: `backend/__tests__/map-query.test.js`

- [ ] **Step 1: Write failing query-normalization tests**

```js
const { normalizeMapQuery } = require('../validators/mapQuery');

test('normalizes map query defaults', () => {
  expect(normalizeMapQuery({})).toEqual({
    scope: 'smart', relationship: 'all', period: '7d', content: 'all', query: '', limit: 500,
  });
});

test('rejects unsupported filter values', () => {
  expect(() => normalizeMapQuery({ period: 'forever' })).toThrow('Invalid map query');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix backend -- map-query.test.js`

Expected: FAIL because `mapQuery.js` and `FootprintQueryService.js` do not exist.

- [ ] **Step 3: Implement bounded query normalization**

```js
const { z } = require('zod');

const schema = z.object({
  scope: z.enum(['smart', 'region', 'country', 'global']).default('smart'),
  relationship: z.enum(['all', 'self', 'friends', 'public']).default('all'),
  period: z.enum(['24h', '7d', 'year']).default('7d'),
  content: z.enum(['all', 'photo', 'unread']).default('all'),
  query: z.string().trim().max(80).default(''),
  countryCode: z.string().trim().max(8).optional(),
  regionCode: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

function normalizeMapQuery(input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid map query');
  return result.data;
}

module.exports = { normalizeMapQuery };
```

- [ ] **Step 4: Implement `FootprintQueryService.listMap`**

Import `AppError`, `getFriendIds` from the existing `SuperuserPolicy`, `populateFootprint` from `services/footprint`, and `getUnreadByFootprintId` from Task 3. The service builds authorization before search, treats a missing legacy `visibility` as public only during the approved backfill transition, applies geography and relationship filters, sorts `{ createdAt: -1, _id: -1 }`, and decorates sanitized results with `relationship`, `sourceScope`, `sourceLabel`, `visibility`, `isUnread`, and `canInteract`.

```js
async function listMap({ viewer, query }) {
  const normalized = normalizeMapQuery(query);
  if (!viewer && normalized.content === 'unread') {
    throw new AppError(400, '登录后才能筛选未读足迹');
  }
  const friendIds = viewer ? await getFriendIds(viewer.id) : new Set();
  const candidateFilters = await buildCandidateFilters({ viewer, friendIds, normalized, now: new Date() });
  const docs = await listCandidateLayers({
    candidateFilters,
    limit: normalized.limit,
    isAdmin: viewer?.role === 'admin',
  });
  const unreadById = viewer
    ? await getUnreadByFootprintId({ viewerId: viewer.id, footprints: docs })
    : new Map();
  const footprints = docs
    .map((doc) => decorateMapFootprint(doc, { viewer, friendIds, normalized, unreadById }))
    .filter((item) => normalized.content !== 'unread' || item.isUnread);
  return { footprints, query: normalized };
}
```

`buildCandidateFilters` and `listCandidateLayers` are exported and tested directly. Owner branches may read all three visibility values; friend branches may read `public | friends`; stranger/guest branches may read only active public discovery. Fixed region/country scopes produce one authorized geographic layer. Smart scope produces owner/friend, region, country excluding region, and global excluding country layers in that order. `listCandidateLayers` fills the bounded candidate set layer-by-layer, de-duplicates IDs, then sorts the final set by `createdAt DESC, _id DESC`. Text search escapes regex metacharacters and combines `placeName`, `message`, and a `User.name` lookup inside every authorized layer; only sanitized footprint results are returned.

- [ ] **Step 5: Mount the endpoint before dynamic footprint IDs**

```js
router.get('/map/footprints', optionalAuth, async (req, res) => {
  const result = await footprintQueryService.listMap({ viewer: req.user || null, query: req.query });
  res.json(result);
});

router.post('/map/location-context', optionalAuth, async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new AppError(400, 'Invalid coordinates');
  }
  res.json({ location: await reverseGeocodeStructured(lat, lng) });
});
```

Extend the existing rounded-coordinate Nominatim cache so `reverseGeocodeStructured` returns `{ displayName, countryCode, countryName, regionCode, regionName }`; `reverseGeocode` keeps returning the display string for rollback callers. In `backend/routes/api.js`, mount `router.use(mapRoutes)` with the existing auth and notification subrouters, before `GET /footprints/:id`.

- [ ] **Step 6: Test authorization, source decoration, unread, geography, and stable order**

Create owner, accepted-friend, stranger-public, stranger-expired, friend-only, private, and legacy fixtures. Assert guest/owner/friend matrices; exact region/country/global behavior; escaped author/place/message search; photo and unread filters; equal timestamps ordered by `_id DESC`; `realLocation` never returned to non-admin callers; and guest unread returns 400 rather than a misleading empty list.

Run: `npm.cmd test --prefix backend -- map-query.test.js`

Expected: PASS with no unauthorized record IDs in any response.

- [ ] **Step 7: Commit**

```powershell
git add backend/validators/mapQuery.js backend/services/FootprintQueryService.js backend/services/nominatim.js backend/routes/map.js backend/routes/api.js backend/__tests__/map-query.test.js
git commit -m "feat: add authorized map footprint query"
```

### Task 5: Define Frontend Query and URL State

**Files:**
- Create: `frontend/src/domain/mapQuery.ts`
- Create: `frontend/src/domain/__tests__/mapQuery.test.ts`
- Modify: `frontend/src/api.js`
- Create: `frontend/src/hooks/useMapFootprints.js`

- [ ] **Step 1: Write failing URL round-trip tests**

```ts
import { DEFAULT_MAP_QUERY, parseMapQuery, serializeMapQuery } from '../mapQuery';

it('round-trips valid map state', () => {
  const query = { ...DEFAULT_MAP_QUERY, scope: 'region', relationship: 'friends', period: '24h', content: 'photo', query: '高知' };
  expect(parseMapQuery(serializeMapQuery(query))).toEqual(query);
});

it('drops invalid and default values', () => {
  expect(parseMapQuery(new URLSearchParams('scope=invalid&period=7d'))).toEqual(DEFAULT_MAP_QUERY);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- mapQuery.test.ts`

Expected: FAIL because `mapQuery.ts` does not exist.

- [ ] **Step 3: Implement typed defaults and canonical serialization**

```ts
export const DEFAULT_MAP_QUERY = {
  scope: 'smart', relationship: 'all', period: '7d', content: 'all', query: '',
} as const;

const VALUES = {
  scope: new Set(['smart', 'region', 'country', 'global']),
  relationship: new Set(['all', 'self', 'friends', 'public']),
  period: new Set(['24h', '7d', 'year']),
  content: new Set(['all', 'photo', 'unread']),
};

export function parseMapQuery(params: URLSearchParams) {
  const read = (key, allowed, fallback) => {
    const value = params.get(key);
    return value && allowed.has(value) ? value : fallback;
  };
  return {
    scope: read('scope', VALUES.scope, DEFAULT_MAP_QUERY.scope),
    relationship: read('relationship', VALUES.relationship, DEFAULT_MAP_QUERY.relationship),
    period: read('period', VALUES.period, DEFAULT_MAP_QUERY.period),
    content: read('content', VALUES.content, DEFAULT_MAP_QUERY.content),
    query: (params.get('q') || '').trim().slice(0, 80),
  };
}

export function serializeMapQuery(query) {
  const params = new URLSearchParams();
  for (const key of ['scope', 'relationship', 'period', 'content']) {
    if (query[key] !== DEFAULT_MAP_QUERY[key]) params.set(key, query[key]);
  }
  const search = query.query.trim().slice(0, 80);
  if (search) params.set('q', search);
  return params;
}

export function mapQueryKey(query) {
  return ['footprints', 'map', query];
}
```

- [ ] **Step 4: Add API and React Query hook**

```js
map: {
  list(query, opts) { return api.get(qs('/api/map/footprints', query), opts); },
  search(query, opts) { return api.get(qs('/api/map/search', query), opts); },
  resolveLocation(data, opts) { return api.post('/api/map/location-context', data, opts); },
},
// Add inside the existing footprints group:
markRead(id) { return api.put(`/api/footprints/${id}/read`); },
importReadState(entries) { return api.post('/api/footprints/read-state/import', { entries }); },
```

```js
export default function useMapFootprints(query) {
  return useQuery({
    queryKey: mapQueryKey(query),
    queryFn: async ({ signal }) => (await apiClient.map.list(query, { signal })).data,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- mapQuery.test.ts`

Expected: PASS.

```powershell
git add frontend/src/domain/mapQuery.ts frontend/src/domain/__tests__/mapQuery.test.ts frontend/src/api.js frontend/src/hooks/useMapFootprints.js
git commit -m "feat: add shared map query state"
```

### Task 6: Add the Shared Location Context

**Files:**
- Create: `frontend/src/hooks/useLocationContext.js`
- Create: `frontend/src/hooks/__tests__/useLocationContext.test.jsx`
- Create: `frontend/src/domain/locationStorage.js`

- [ ] **Step 1: Write failing permission and cooldown tests**

Test denied location returns global context, an ordinary reminder is suppressed for seven days, and explicit locate bypasses cooldown.

```jsx
expect(result.current.scopeContext).toEqual({ scope: 'global', reason: 'permission-denied' });
expect(result.current.shouldRemind({ explicit: false, now: DAY_2 })).toBe(false);
expect(result.current.shouldRemind({ explicit: true, now: DAY_2 })).toBe(true);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- useLocationContext.test.jsx`

Expected: FAIL because the hook is missing.

- [ ] **Step 3: Implement bounded location preference storage**

```js
const SCOPE_KEY = 'bliver_map_scope_v1';
const REMINDER_KEY = 'bliver_location_reminder_at_v1';

export function loadFixedScope() {
  try {
    const value = JSON.parse(localStorage.getItem(SCOPE_KEY));
    return ['region', 'country', 'global'].includes(value?.scope) ? value : null;
  } catch { return null; }
}

export function saveFixedScope(value) {
  if (value) localStorage.setItem(SCOPE_KEY, JSON.stringify(value));
  else localStorage.removeItem(SCOPE_KEY);
}

export const loadReminderAt = () => Number(localStorage.getItem(REMINDER_KEY) || 0);
export const saveReminderAt = (now) => localStorage.setItem(REMINDER_KEY, String(now));
```

- [ ] **Step 4: Implement one location state machine**

Use states `idle | locating | granted | denied | unavailable | error`. `requestLocation({ explicit })` calls `navigator.geolocation.getCurrentPosition`, sends the transient coordinates to `apiClient.map.resolveLocation`, then stores only `{ countryCode, countryName, regionCode, regionName }` in memory. Permission denial sets `{ scope: 'global', reason: 'permission-denied' }`. Expose `requestLocation`, `setFixedScope`, `clearFixedScope`, `shouldRemind`, `permissionState`, and `scopeContext`. `shouldRemind` returns true for explicit actions and otherwise only when seven days have elapsed.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- useLocationContext.test.jsx`

Expected: PASS.

```powershell
git add frontend/src/hooks/useLocationContext.js frontend/src/hooks/__tests__/useLocationContext.test.jsx frontend/src/domain/locationStorage.js
git commit -m "feat: add shared location context"
```

### Task 7: Build Authorized Unified Map Search

**Files:**
- Modify: `backend/routes/map.js`
- Modify: `backend/services/nominatim.js`
- Modify: `backend/services/FootprintQueryService.js`
- Modify: `backend/__tests__/map-query.test.js`
- Create: `frontend/src/components/map/MapSearch.jsx`
- Create: `frontend/src/components/map/__tests__/MapSearch.test.jsx`

- [ ] **Step 1: Add failing backend search authorization tests**

Create public, friend-only, private, and expired footprints containing the same search term in author, place, or message fields. Assert guest results contain only current public content and that `{ places, footprints, errors }` never contains hidden counts, IDs, snippets, or region hints.

- [ ] **Step 2: Add failing frontend debounce and partial-failure tests**

```jsx
await user.type(screen.getByRole('searchbox', { name: '搜索地点或足迹' }), '高知');
await vi.advanceTimersByTimeAsync(299);
expect(apiClient.map.search).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(1);
expect(apiClient.map.search).toHaveBeenCalledTimes(1);
```

Also assert `ArrowDown`, `ArrowUp`, `Enter`, and `Escape`; stale response A cannot replace newer response B; place failure preserves footprint results; and footprint failure preserves place results.

- [ ] **Step 3: Implement the search endpoint**

Add cached `searchPlaces(query, { countryCode, regionCode, signal })` beside the structured reverse geocoder. `GET /api/map/search` accepts the normalized map query and viewer context, calls `FootprintQueryService.searchAuthorized` and `searchPlaces` with `Promise.allSettled`, and returns `{ places, footprints, errors: { places?: string, footprints?: string } }`. A failed group returns an empty array only for that group.

- [ ] **Step 4: Implement `MapSearch`**

Use one searchbox and a 300 ms debounced React Query request keyed by `['footprints', 'map-search', normalizedQuery]`. Render grouped `地点` and `足迹` options in one listbox, set `aria-activedescendant`, wrap arrow-key movement, select with Enter, close with Escape, pass the React Query `signal` to Axios, and show group-local loading/empty/error copy. Selecting a place emits its viewport only; selecting a footprint emits its authorized footprint ID.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm.cmd test --prefix backend -- map-query.test.js`

Run: `npm.cmd test --prefix frontend -- MapSearch.test.jsx`

Expected: both PASS.

```powershell
git add backend/routes/map.js backend/services/nominatim.js backend/services/FootprintQueryService.js backend/__tests__/map-query.test.js frontend/src/components/map/MapSearch.jsx frontend/src/components/map/__tests__/MapSearch.test.jsx
git commit -m "feat: add authorized map search"
```

### Task 8: Add Scope and Filter Controls

**Files:**
- Create: `frontend/src/components/map/MapScopeControl.jsx`
- Create: `frontend/src/components/map/MapFilterSheet.jsx`
- Create: `frontend/src/components/map/__tests__/MapFilterSheet.test.jsx`
- Modify: `frontend/src/components/MapHomeControls.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing control tests**

Assert scope choices are `智能`, `本省`, `本国`, `全球`; region/country are disabled until their codes resolve; choosing a disabled scope invokes contextual location guidance; filters are grouped exactly as approved; guests see unread disabled with `登录后可筛选未读`; Apply emits one normalized query; Reset returns defaults; Escape closes and restores focus.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- MapFilterSheet.test.jsx`

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Implement scope and filter components**

Use native buttons/radios with 44-pixel targets. `MapScopeControl` receives `scopeContext` and returns `{ scope, countryCode?, regionCode? }`; `MapFilterSheet` keeps a draft and calls `onApply(nextQuery)` once. Only one sheet is open. The selected summary reads naturally, for example `本省 · 好友 · 24小时`. The filter sheet uses full-field grouping, not nested cards.

- [ ] **Step 4: Compose `MapHomeControls`**

```jsx
<MapSearch query={query.query} onQueryChange={onQueryChange} onSelectPlace={onSelectPlace} onSelectFootprint={onSelectFootprint} />
<div className="bliver-map-toolbar">
  <MapScopeControl value={query.scope} context={locationContext} onChange={onScopeChange} />
  <button type="button" onClick={openFilters} aria-expanded={filtersOpen}><ListFilter />筛选</button>
</div>
```

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- MapFilterSheet.test.jsx MapHomeControls.test.jsx`

Expected: PASS.

```powershell
git add frontend/src/components/map/MapScopeControl.jsx frontend/src/components/map/MapFilterSheet.jsx frontend/src/components/map/__tests__/MapFilterSheet.test.jsx frontend/src/components/MapHomeControls.jsx frontend/src/styles/tokens.css
git commit -m "feat: add map scope and filters"
```

### Task 9: Correct Marker Source and Pulse Semantics

**Files:**
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Create: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing marker icon tests**

Export pure `buildMarkerDescriptor(footprint, state)` and assert label/ring for self, friend, region, country, global; server-provided `isUnread` creates a static dot; pulse only for explicit `pulseIds`; selected focus; and no streak badge or local `readStatus` lookup.

```js
expect(buildMarkerDescriptor(friendFootprint, { pulseIds: new Set() }).label).toBe('好友');
expect(buildMarkerDescriptor({ ...publicFootprint, isUnread: true }, { pulseIds: new Set(['fp-1']) }).unread).toBe(true);
expect(buildMarkerDescriptor(publicFootprint, { pulseIds: new Set(['fp-1']) }).pulse).toBe(true);
expect(buildMarkerDescriptor(publicFootprint, { pulseIds: new Set() }).pulse).toBe(false);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- ClusterMarkers.test.jsx`

Expected: FAIL because descriptors and source labels are missing.

- [ ] **Step 3: Implement descriptors and explicit one-time pulse tracking**

The initial query and ordinary filter/scope changes never pulse. App owns a transient `pulseIds` set; only `footprint:new`, the successful publish response, or an explicit focus action adds an ID. `ClusterMarkers` calls `onPulseComplete(id)` from animation end so App removes it. Include `relationship`, `sourceScope`, `isUnread`, selected, and pulse in the icon cache key. Delete the marker dependency on `getReadMap`, `seedReadMap`, and `markReadVersion`.

- [ ] **Step 4: Implement accessible marker CSS**

Use `.bliver-map-marker--self`, `--friend`, `--region`, `--country`, `--global`, `--unread`, `--pulse`, and `--selected`. Pulse once; reduced motion uses a static outline. Do not add blur, looping float, or glow.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- ClusterMarkers.test.jsx`

Expected: PASS.

```powershell
git add frontend/src/components/ClusterMarkers.jsx frontend/src/components/__tests__/ClusterMarkers.test.jsx frontend/src/styles/tokens.css
git commit -m "feat: add relationship-aware map markers"
```

### Task 10: Implement Zoom-First Clusters and Same-Place Sheet

**Files:**
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Create: `frontend/src/components/map/SamePlaceSheet.jsx`
- Create: `frontend/src/components/map/__tests__/SamePlaceSheet.test.jsx`
- Modify: `frontend/src/store/useUIStore.ts`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing cluster decision tests**

Extract `shouldOpenSamePlace({ zoom, maxZoom, childLatLngs })`. Assert dispersed markers zoom first, effectively identical coordinates open immediately because no separation is possible, and close-but-distinct coordinates remain zoomable below `maxZoom - 1` but open at that threshold.

- [ ] **Step 2: Write failing sheet accessibility tests**

Assert descending time order, source labels, Escape close, focus restoration, safe-area class, and selection emits a footprint ID before closing.

- [ ] **Step 3: Implement zoom-first behavior**

```js
if (shouldOpenSamePlace({ zoom: map.getZoom(), maxZoom: map.getMaxZoom(), childLatLngs })) {
  useUIStore.getState().openSamePlace(markerIds);
} else {
  map.fitBounds(cluster.getBounds(), { padding: [48, 96], maxZoom: map.getZoom() + 2 });
}
```

- [ ] **Step 4: Implement `SamePlaceSheet` and replace ClusterDetailPanel for map clusters**

Add `samePlaceIds: string[]`, `openSamePlace(ids)`, and `closeSamePlace()` to Zustand. The sheet consumes those IDs and derives current items from the React Query response, sorted by `createdAt DESC, _id DESC`; it never stores copied footprint objects. Use a labelled dialog, focus the close button on open, close on Escape, restore the trigger focus, reserve `env(safe-area-inset-bottom)` plus the mobile navigation height, and route item selection through `setMapPreviewId(id)` before closing.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- ClusterMarkers.test.jsx SamePlaceSheet.test.jsx`

Expected: PASS.

```powershell
git add frontend/src/components/ClusterMarkers.jsx frontend/src/components/map/SamePlaceSheet.jsx frontend/src/components/map/__tests__/SamePlaceSheet.test.jsx frontend/src/store/useUIStore.ts frontend/src/App.jsx frontend/src/styles/tokens.css
git commit -m "feat: add zoom-first map clusters"
```

### Task 11: Separate Tile, Data, Empty, and Location States

**Files:**
- Create: `frontend/src/components/map/MapStatusNotice.jsx`
- Modify: `frontend/src/components/MapView.jsx`
- Create: `frontend/src/components/__tests__/MapView.test.jsx`
- Extend: `frontend/src/components/__tests__/MapPreviewCard.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing tile-state tests**

Mock `TileLayer` event handlers. Assert three tile errors within one load generation produce one `底图暂时无法加载` notice, additional errors do not duplicate it, retry increments the layer key and resets the counter, one successful load clears the notice, and footprint errors remain separate.

- [ ] **Step 2: Write failing preview lifecycle tests**

Assert image error hides only the image, long text keeps action accessible, source label is rendered, and missing selected data closes preview through App integration.

- [ ] **Step 3: Implement tile events and status notices**

Use `eventHandlers={{ tileerror: handleTileError, load: handleTileLoad }}` and a retry generation key. `MapStatusNotice` accepts `kind: 'tile' | 'data' | 'refresh' | 'empty' | 'offline' | 'location'`, one action label, and one callback. Initial data loading shows quiet control skeletons; background fetching keeps cached markers and shows `正在更新足迹`; data failure shows `足迹暂时无法加载` plus retry; `navigator.onLine === false` with cached data shows `当前显示离线缓存`. No state blocks map drag or duplicates another notice.

- [ ] **Step 4: Implement distinct empty copy**

No account footprints: `发布第一条足迹`.

No filter results: `当前筛选没有足迹` with `清除筛选`.

No fixed-scope results: `这个地区暂时没有可见足迹` with `查看更大范围`.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test --prefix frontend -- MapView.test.jsx MapPreviewCard.test.jsx App.mobile-shell.test.jsx`

Expected: PASS.

```powershell
git add frontend/src/components/map/MapStatusNotice.jsx frontend/src/components/MapView.jsx frontend/src/components/__tests__/MapView.test.jsx frontend/src/components/MapPreviewCard.jsx frontend/src/components/__tests__/MapPreviewCard.test.jsx frontend/src/App.jsx frontend/src/styles/tokens.css
git commit -m "feat: harden map loading and failure states"
```

### Task 12: Integrate Map Query, URL State, and Socket Cache Updates

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/hooks/socketHandlers.js`
- Modify: `frontend/src/hooks/useSocket.js`
- Create: `frontend/src/hooks/useLegacyReadImport.js`
- Create: `frontend/src/hooks/__tests__/useLegacyReadImport.test.jsx`
- Modify: `frontend/src/readStatus.js`
- Modify: `frontend/src/components/FootprintDetailModal.jsx`
- Modify: `frontend/src/components/__tests__/FootprintDetailModal.test.jsx`
- Modify: `frontend/src/hooks/__tests__/socketHandlers.test.js`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx`

- [ ] **Step 1: Write failing App URL/query integration tests**

Assert URL initializes query, filter changes replace canonical URL, `useMapFootprints` receives normalized query, and selected preview closes when the returned list no longer contains its ID.

- [ ] **Step 2: Write failing Socket cache tests**

Assert footprint new/update/delete invalidates `['footprints', 'map']` and future `['footprints', 'activity']` prefixes without keeping a second array in Zustand.

- [ ] **Step 3: Write failing authoritative read integration tests**

Assert `MapPreviewCard` and markers render `footprint.isUnread` without reading local storage; opening detail calls `apiClient.footprints.markRead(id)` once; successful mark-read immediately changes every cached copy of that ID to `isUnread: false`; and the one-time importer sends at most the 500 newest legacy entries once per authenticated user.

- [ ] **Step 4: Integrate App with `useMapFootprints`**

Remove the map's dependency on `useFootprints(period)` while leaving the old hook available to rollback surfaces. Name the React Query result `mapFootprintsQuery` consistently and drive `MapView`, preview, and same-place sheet from `mapFootprintsQuery.data?.footprints || []`. Parse URL state once at startup, replace only canonical map parameters on changes while preserving unrelated parameters such as `fp`, and close `mapPreviewId`/`samePlaceIds` when IDs disappear from the active authorized response.

- [ ] **Step 5: Replace local read state and import it once**

Keep only `getLegacyReadEntries(userId)` in `readStatus.js`; it converts the old object map into valid `{ footprintId, readAt }` entries, sorts newest first, and caps at 500. `useLegacyReadImport(userId)` skips guests and the key `bliver_read_imported_v1_${userId}`, calls `importReadState`, and records the key only after success. `FootprintDetailModal` marks read through the API, optimistically rewrites matching map cache items to `isUnread: false`, invalidates map/activity query prefixes after settlement, and retains a retryable unread notice if the request fails.

- [ ] **Step 6: Update Socket handlers to invalidate query prefixes**

Export `invalidateFootprintLists(queryClient)` and call both `invalidateQueries({ queryKey: ['footprints', 'map'] })` and `invalidateQueries({ queryKey: ['footprints', 'activity'] })`. New/update/delete events call this helper; `footprint:new` also adds the explicit pulse ID. Preserve current detail mutation behavior until Phase 4 moves it to the shared contract.

- [ ] **Step 7: Run focused and full suites**

Run: `npm.cmd test --prefix frontend -- App.mobile-shell.test.jsx socketHandlers.test.js useLegacyReadImport.test.jsx FootprintDetailModal.test.jsx ClusterMarkers.test.jsx MapPreviewCard.test.jsx`

Run: `npm.cmd test --prefix frontend`

Run: `npm.cmd test --prefix backend`

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/hooks/socketHandlers.js frontend/src/hooks/useSocket.js frontend/src/hooks/useLegacyReadImport.js frontend/src/hooks/__tests__/socketHandlers.test.js frontend/src/hooks/__tests__/useLegacyReadImport.test.jsx frontend/src/readStatus.js frontend/src/components/FootprintDetailModal.jsx frontend/src/components/__tests__/FootprintDetailModal.test.jsx frontend/src/__tests__/App.mobile-shell.test.jsx
git commit -m "feat: integrate shared map query cache"
```

### Task 13: Apply UI Skill Critique and Complete Browser Acceptance

**Files:**
- Modify only files introduced or changed in Tasks 4-12 when a verified visual defect requires correction.
- Create: `docs/qa/map-home-completion-checklist.md`

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
```

Expected: backend and frontend test suites PASS, typecheck exits 0, production build exits 0, and diff check emits no errors. Existing bundle-size warnings are recorded but do not fail Phase 2.

- [ ] **Step 2: Start the production preview and inspect target viewports**

Run: `npm.cmd run preview --prefix frontend -- --host 127.0.0.1 --port 4173`

Inspect 360×800, 390×844, 430×932, and 1440×1000. Validate map movement, search keyboard, scope/filter sheets, locate denial, markers, clusters, same-place sheet, preview, long names, image failure, tile failure, data failure, empty filters, offline cache, focus, and reduced motion.

- [ ] **Step 3: Capture and read screenshots**

Capture at minimum:

- default map at 390×844;
- search results at 390×844;
- filter sheet at 360×800;
- same-place sheet at 430×932;
- preview with long place and photo at 390×844;
- tile failure and data failure states;
- desktop default and selection at 1440×1000.

Read each screenshot back. A saved but uninspected screenshot does not count.

- [ ] **Step 4: Write the Impeccable/Frontend Design critique before polishing**

Record concrete findings in `docs/qa/map-home-completion-checklist.md` under:

- information hierarchy and preserved map area;
- Bliver footprint-imprint signature;
- control vocabulary and state completeness;
- contrast and typography;
- safe areas, keyboard, long text, and overlap;
- motion purpose and reduced-motion behavior;
- prohibited patterns (glass, glow, excessive pills, nested cards, arbitrary z-index).

- [ ] **Step 5: Fix only evidenced defects and re-run affected checks**

For each material finding, add or update a test when behavior is involved, patch the responsible component/token, rebuild, and re-inspect the affected viewport. Document accepted deviations and environment limitations.

- [ ] **Step 6: Run the final verification gate**

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
git status --short
```

Expected: all commands succeed; status lists only intended Phase 2 work and QA documentation.

- [ ] **Step 7: Commit final visual acceptance**

```powershell
git add frontend/src docs/qa/map-home-completion-checklist.md
git commit -m "test: verify completed map home experience"
```

---

## Completion Criteria

- Map and Activity consume the same visibility, geography, relationship, and scope vocabulary.
- Search never leaks unauthorized footprint information.
- Authenticated unread state is server-authoritative, survives devices, imports legacy local timestamps once, and drives filters, markers, previews, and detail consistently.
- Scope, relationship, time, and content filters are functional and URL-restorable.
- Markers identify source with text plus visual treatment; unread and new states have correct non-looping semantics.
- Clusters zoom first and use the Natural City same-place sheet only when spatial separation is exhausted.
- Tile, footprint, empty, offline, and location states are distinct and actionable.
- The selected preview never survives loss of access or disappearance from the active query.
- Backend and frontend suites, typecheck, build, diff check, and required browser viewports pass.
- Impeccable and Frontend Design critique is written, evidenced defects are corrected, and screenshots are inspected twice where corrections were needed.
