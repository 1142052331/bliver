# Cluster Pin and Direct Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace numeric map clusters with stacked source-colored pins and open a footprint list on the first cluster click, with map expansion available as an optional sheet action.

**Architecture:** Pure helpers derive unique place counts, source colors, unread state, accessible labels, cache keys, and safe HTML from Leaflet child markers. Zustand stores one `clusterData` selection, while a renamed `ClusterFootprintSheet` renders inside `MapContainer` so it can call Leaflet `fitBounds` directly.

**Tech Stack:** React 19, Leaflet, leaflet.markercluster, Zustand 5, Vitest/Testing Library, Tailwind/CSS tokens.

---

## File Map

- `frontend/src/components/ClusterMarkers.jsx`: cluster descriptors, stacked-pin HTML, icon caching, direct cluster selection.
- `frontend/src/components/__tests__/ClusterMarkers.test.jsx`: descriptor, HTML, cache, and direct-click unit tests.
- `frontend/src/styles/tokens.css`: stacked-pin geometry, source colors, label, unread dot, and responsive sheet names.
- `frontend/src/store/useUIStore.ts`: replace duplicate same-place state with typed cluster selection actions.
- `frontend/src/store/__tests__/useUIStore.test.ts`: cluster selection and global reset behavior.
- `frontend/src/components/map/ClusterFootprintSheet.jsx`: renamed general cluster sheet with optional map expansion.
- `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`: title, sorting, expand, selection, close, and focus tests.
- `frontend/src/components/MapView.jsx`: render the sheet inside Leaflet context and reconcile visible footprint IDs.
- `frontend/src/components/__tests__/MapView.test.jsx`: integration contract for cluster sheet rendering.
- `frontend/src/App.jsx`: remove legacy `SamePlaceSheet` ownership and same-place reconciliation.
- `frontend/src/__tests__/App.mobile-shell.test.jsx`: update mocked UI-store shape and prove destination cleanup clears cluster state.
- Delete `frontend/src/components/map/SamePlaceSheet.jsx` and its old test after migration.

### Task 1: Build stable cluster descriptors and stacked-pin HTML

**Files:**
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Modify: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing descriptor and HTML tests**

Add markers with coordinates, sources, and unread metadata. Assert coordinate de-duplication, frequency ordering, the full accessible label, a maximum of three pin layers, escaped text, and a cache key that covers all visual state:

```jsx
const markers = [
  marker({ id: 'a', lat: 31.2304001, lng: 121.4737001, source: 'friend', unread: false }),
  marker({ id: 'b', lat: 31.2304002, lng: 121.4737002, source: 'friend', unread: true }),
  marker({ id: 'c', lat: 31.231, lng: 121.474, source: 'self', unread: false }),
];
const descriptor = buildClusterDescriptor(markers);

expect(descriptor).toMatchObject({
  placeCount: 2,
  footprintCount: 3,
  sourceScopes: ['friend', 'self'],
  hasUnread: true,
  label: '2 个地点',
  accessibleLabel: '2 个地点，3 条足迹，包含未读更新',
});
expect(buildClusterHtml(descriptor).match(/bliver-map-cluster__pin/g)).toHaveLength(3);
expect(clusterCacheKey(descriptor)).toBe('2:3:friend,self:unread');
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test -- src/components/__tests__/ClusterMarkers.test.jsx`

Expected: FAIL because `buildClusterDescriptor`, `buildClusterHtml`, and `clusterCacheKey` do not exist.

- [ ] **Step 3: Implement pure descriptor helpers**

Export a fixed source priority and helpers:

```js
const SOURCE_PRIORITY = ['self', 'friend', 'region', 'country', 'global'];
const coordinateKey = ({ lat, lng }) => `${lat.toFixed(6)}:${lng.toFixed(6)}`;

export function buildClusterDescriptor(markers) {
  const places = new Set();
  const sourceCounts = new Map();
  let hasUnread = false;
  markers.forEach((marker) => {
    const point = marker.getLatLng();
    places.add(coordinateKey(point));
    const source = SOURCE_PRIORITY.includes(marker._sourceScope) ? marker._sourceScope : 'global';
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    hasUnread ||= Boolean(marker._isUnread);
  });
  const sourceScopes = [...sourceCounts]
    .sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || SOURCE_PRIORITY.indexOf(left) - SOURCE_PRIORITY.indexOf(right))
    .slice(0, 3)
    .map(([source]) => source);
  const placeCount = places.size;
  const footprintCount = markers.length;
  return {
    placeCount, footprintCount, sourceScopes, hasUnread,
    label: `${placeCount} 个地点`,
    accessibleLabel: `${placeCount} 个地点，${footprintCount} 条足迹${hasUnread ? '，包含未读更新' : ''}`,
  };
}
```

- [ ] **Step 4: Implement safe HTML and icon caching**

Build exactly three pin spans by repeating the last source when fewer than three source types exist. Include a visible label and unread dot:

```js
export function clusterCacheKey(descriptor) {
  return [descriptor.placeCount, descriptor.footprintCount, descriptor.sourceScopes.join(','), descriptor.hasUnread ? 'unread' : 'read'].join(':');
}

export function buildClusterHtml(descriptor) {
  const sources = Array.from({ length: 3 }, (_, index) => descriptor.sourceScopes[index] || descriptor.sourceScopes.at(-1) || 'global');
  return `<div class="bliver-map-cluster${descriptor.hasUnread ? ' bliver-map-cluster--unread' : ''}" role="button" aria-label="${escapeHtml(descriptor.accessibleLabel)}">
    <span class="bliver-map-cluster__stack" aria-hidden="true">${sources.map((source, index) => `<i class="bliver-map-cluster__pin bliver-map-cluster__pin--${source} bliver-map-cluster__pin--${index + 1}"></i>`).join('')}</span>
    <span class="bliver-map-cluster__label">${escapeHtml(descriptor.label)}</span>
    ${descriptor.hasUnread ? '<span class="bliver-map-cluster__dot" aria-hidden="true"></span>' : ''}
  </div>`;
}
```

Use `cachedIcon(clusterCacheKey(descriptor), ...)`, an icon size wide enough for the label, and a stable anchor. Replace the old circular-cluster CSS with stacked-pin and label classes using existing source variables.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm.cmd test -- src/components/__tests__/ClusterMarkers.test.jsx`

Expected: PASS.

```bash
git add frontend/src/components/ClusterMarkers.jsx frontend/src/components/__tests__/ClusterMarkers.test.jsx frontend/src/styles/tokens.css
git commit -m "feat: render descriptive stacked cluster pins"
```

### Task 2: Replace same-place state with direct cluster selection

**Files:**
- Modify: `frontend/src/store/useUIStore.ts`
- Modify: `frontend/src/store/__tests__/useUIStore.test.ts`
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Modify: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`

- [ ] **Step 1: Write failing UI-store and click tests**

Assert one typed selection and direct click behavior:

```ts
const selection = {
  footprintIds: ['fp-1', 'fp-2'],
  bounds: [[31.23, 121.47], [31.24, 121.48]] as [[number, number], [number, number]],
  placeCount: 2,
  footprintCount: 2,
};
useUIStore.getState().openCluster(selection);
expect(useUIStore.getState().clusterData).toEqual(selection);
useUIStore.getState().closeCluster();
expect(useUIStore.getState().clusterData).toBeNull();
```

Mock a `clusterclick`, then assert `openCluster` receives marker IDs, bounds, and counts while `map.fitBounds` is not called.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/store/__tests__/useUIStore.test.ts src/components/__tests__/ClusterMarkers.test.jsx`

Expected: FAIL because `openCluster` and `closeCluster` do not exist and click still branches to `fitBounds`.

- [ ] **Step 3: Type and implement cluster selection state**

Replace the old payload with:

```ts
interface ClusterPayload {
  footprintIds: string[];
  bounds: [[number, number], [number, number]];
  placeCount: number;
  footprintCount: number;
}
```

Remove `samePlaceIds`, `openSamePlace`, and `closeSamePlace`. Add:

```ts
openCluster: (selection) => set({ clusterData: { ...selection, footprintIds: [...new Set(selection.footprintIds)] } }),
closeCluster: () => set({ clusterData: null }),
```

Keep `closeTransientSurfaces` resetting `clusterData: null`.

- [ ] **Step 4: Make every cluster click open the selection**

Replace the click branch with:

```js
group.on('clusterclick', (event) => {
  const markers = event.layer.getAllChildMarkers();
  const descriptor = buildClusterDescriptor(markers);
  const bounds = event.layer.getBounds();
  useUIStore.getState().openCluster({
    footprintIds: markers.map((marker) => marker._footprintId),
    bounds: [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]],
    placeCount: descriptor.placeCount,
    footprintCount: descriptor.footprintCount,
  });
});
```

Remove `shouldOpenSamePlace`; `fitBounds` must not run from `clusterclick`.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm.cmd test -- src/store/__tests__/useUIStore.test.ts src/components/__tests__/ClusterMarkers.test.jsx`

Expected: PASS.

```bash
git add frontend/src/store/useUIStore.ts frontend/src/store/__tests__/useUIStore.test.ts frontend/src/components/ClusterMarkers.jsx frontend/src/components/__tests__/ClusterMarkers.test.jsx
git commit -m "fix: open cluster list on first click"
```

### Task 3: Generalize the sheet and make map expansion optional

**Files:**
- Create: `frontend/src/components/map/ClusterFootprintSheet.jsx`
- Create: `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`
- Delete: `frontend/src/components/map/SamePlaceSheet.jsx`
- Delete: `frontend/src/components/map/__tests__/SamePlaceSheet.test.jsx`
- Modify: `frontend/src/components/MapView.jsx`
- Modify: `frontend/src/components/__tests__/MapView.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing sheet tests**

Mock `useMap`, render the sheet with two places and three footprints, and assert:

```jsx
expect(screen.getByRole('dialog', { name: '集合足迹' })).toBeVisible();
expect(screen.getByRole('heading', { name: '2 个地点' })).toBeVisible();
expect(screen.getByText('3 条足迹')).toBeVisible();
await user.click(screen.getByRole('button', { name: '在地图中展开' }));
expect(map.fitBounds).toHaveBeenCalledWith([[31.23, 121.47], [31.24, 121.48]], {
  padding: [48, 96], maxZoom: expect.any(Number),
});
expect(onClose).toHaveBeenCalledOnce();
```

Also prove one-place selections hide the expand action, items sort newest first, selecting calls `onSelect` before `onClose`, Escape closes, and focus restores after unmount.

- [ ] **Step 2: Run the sheet test and confirm RED**

Run: `npm.cmd test -- src/components/map/__tests__/ClusterFootprintSheet.test.jsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `ClusterFootprintSheet` inside map context**

Use `useMap()`, `createPortal`, and the existing list markup. Accept:

```js
{ selection, footprints, onClose, onSelect }
```

Filter `selection.footprintIds`, sort by time and ID, render `selection.placeCount` and the current visible item count, and call:

```js
map.fitBounds(selection.bounds, {
  padding: [48, 96],
  maxZoom: Math.min(Number.isFinite(map.getMaxZoom()) ? map.getMaxZoom() : 18, 18),
});
onClose();
```

Hide the expand button unless `placeCount > 1` and bounds contain four finite numbers. Catch a thrown `fitBounds`, close the sheet, and leave the current view unchanged.

- [ ] **Step 4: Render and reconcile the sheet in `MapView`**

Select `clusterData`, `closeCluster`, and `setMapPreviewId` from the store. Derive visible IDs from the current footprints. When an active selection has no visible IDs, call `closeCluster`; otherwise render:

```jsx
{clusterData && (
  <ClusterFootprintSheet
    selection={clusterData}
    footprints={footprints}
    onSelect={setMapPreviewId}
    onClose={closeCluster}
  />
)}
```

Update CSS names from `bliver-same-place-*` to `bliver-cluster-sheet-*` and add a 44px icon button for map expansion.

- [ ] **Step 5: Run sheet and map tests and commit**

Run: `npm.cmd test -- src/components/map/__tests__/ClusterFootprintSheet.test.jsx src/components/__tests__/MapView.test.jsx`

Expected: PASS.

```bash
git add frontend/src/components/map/ClusterFootprintSheet.jsx frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx frontend/src/components/map/SamePlaceSheet.jsx frontend/src/components/map/__tests__/SamePlaceSheet.test.jsx frontend/src/components/MapView.jsx frontend/src/components/__tests__/MapView.test.jsx frontend/src/styles/tokens.css
git commit -m "feat: add direct cluster footprint sheet"
```

### Task 4: Remove legacy App ownership and verify release

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx`
- Modify: `frontend/src/components/__tests__/MapHomeVisualContract.test.jsx`

- [ ] **Step 1: Write failing integration expectations**

Update App mocks to expose `clusterData`, `openCluster`, and `closeCluster`, remove `samePlaceIds`, and assert `closeTransientSurfaces` remains the only destination cleanup entry point. Add a visual contract expectation that `MapView` receives footprints and owns the cluster sheet rather than App rendering a separate sheet.

- [ ] **Step 2: Run App integration tests and confirm RED**

Run: `npm.cmd test -- src/__tests__/App.mobile-shell.test.jsx src/components/__tests__/MapHomeVisualContract.test.jsx`

Expected: FAIL while App still imports and renders `SamePlaceSheet` and reads `samePlaceIds`.

- [ ] **Step 3: Remove App-level same-place state and sheet**

Delete the `SamePlaceSheet` import, `samePlaceIds`/`closeSamePlace` destructuring, the visibility reconciliation branch, and the App-level render block. Keep cluster cleanup inside `closeTransientSurfaces` through `clusterData: null`.

- [ ] **Step 4: Run complete verification**

Run:

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run lint
npm.cmd --prefix backend test -- --runInBand
npm.cmd run check:node
npm.cmd run render-build
Test-Path frontend/dist/index.html
git diff --check
```

Expected: tests and typecheck pass; lint has zero errors; Node 24 and production build pass; `Test-Path` prints `True`; diff check is silent.

- [ ] **Step 5: Perform responsive visual acceptance**

Run the local frontend and inspect 360×800, 390×844, and desktop map states for single-source, mixed-source, unread, one-place/multiple-footprint, more-than-three-source, and large-place-count clusters. Confirm a minimum 44px target, no label overflow, first-click sheet opening, optional map expansion, and no overlap with map controls.

- [ ] **Step 6: Commit verification corrections if needed**

```bash
git add frontend/src/App.jsx frontend/src/__tests__/App.mobile-shell.test.jsx frontend/src/components/__tests__/MapHomeVisualContract.test.jsx
git commit -m "test: complete cluster interaction acceptance"
```

Skip this commit if no verification correction was required.
