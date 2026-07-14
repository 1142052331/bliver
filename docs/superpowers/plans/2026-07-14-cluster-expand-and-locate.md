# Cluster Expansion and Single-Footprint Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a cluster expansion visibly reveals its individual markers and give every valid footprint card a direct map-location command.

**Architecture:** `ClusterMarkers` supplies the clicked Leaflet cluster layer's `spiderfy()` callback with the sheet selection. `ClusterFootprintSheet` invokes it to reveal every child marker in the current viewport. Individual-card location remains a local `map.flyTo` at the shared focus zoom.

**Tech Stack:** React 18, react-leaflet, Leaflet.markercluster, lucide-react, Vitest, Testing Library.

---

### Task 1: Make Cluster Expansion Reach Individual Markers

**Files:**
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Modify: `frontend/src/components/map/ClusterFootprintSheet.jsx`
- Modify: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`
- Modify: `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`

- [ ] **Step 1: Write the failing tests**

Require the cluster click payload to include an `expandOnMap` callback that calls the clicked layer's `spiderfy()` method. Update the sheet expectation to require that callback and `onClose` run when the expansion command is clicked.

    expect(openCluster).toHaveBeenCalledWith(expect.objectContaining({ expandOnMap: expect.any(Function) }));
    expect(layer.spiderfy).toHaveBeenCalledOnce();

- [ ] **Step 2: Run test and verify RED**

Run `npm.cmd --prefix frontend test -- --run src/components/__tests__/ClusterMarkers.test.jsx src/components/map/__tests__/ClusterFootprintSheet.test.jsx`.

Expected: the expansion callback is absent and the sheet still calls map navigation instead of spiderfying the clicked cluster.

- [ ] **Step 3: Implement cluster spiderfying**

Have `handleClusterClick` add `expandOnMap: () => layer.spiderfy?.()` to the selection payload. Let `ClusterFootprintSheet` render the expand command only for a multi-place selection with that callback; invoke it before `onClose`. Remove the bounds-fitting and forced-zoom expansion path.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

Run `git add frontend/src/components/ClusterMarkers.jsx frontend/src/components/map/ClusterFootprintSheet.jsx frontend/src/components/__tests__/ClusterMarkers.test.jsx frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx` and `git commit -m "fix: spiderfy cluster map expansion"`.

### Task 2: Add a Per-Card Location Command

**Files:**
- Modify: `frontend/src/components/map/ClusterFootprintSheet.jsx`
- Modify: `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add valid `location` coordinates to a footprint. Assert that a `定位到此位置` command exists and clicking it calls `map.flyTo([31.24, 121.48], 17, { duration: 0.7 })`, then `onSelect('newer')`, then `onClose()`. Add an invalid-coordinate fixture and assert it exposes no location command.

- [ ] **Step 2: Run test and verify RED**

Run `npm.cmd --prefix frontend test -- --run src/components/map/__tests__/ClusterFootprintSheet.test.jsx`.

Expected: the location command is absent.

- [ ] **Step 3: Implement the location command**

Import `Navigation` from `lucide-react`. Render every row as a container with the existing detail button plus a sibling icon button. For valid coordinates, the icon calls `map.flyTo([lat, lng], CLUSTER_EXPANSION_ZOOM, { duration: 0.7 })`, then `onSelect(footprint._id)`, then `onClose()`. Its `aria-label` and `title` are `定位到此位置`.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: all cluster-sheet tests pass.

- [ ] **Step 5: Commit**

Run `git add frontend/src/components/map/ClusterFootprintSheet.jsx frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx` and `git commit -m "feat: locate individual cluster footprints"`.

### Task 3: Verify the Release

**Files:**
- Verify: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`
- Verify: `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`

- [ ] **Step 1: Run all frontend tests**

Run `npm.cmd --prefix frontend test -- --run`. Expected: all test files pass.

- [ ] **Step 2: Run release checks**

Run `npm.cmd run check:node`, `npm.cmd run render-build`, and `Test-Path frontend/dist/index.html`. Expected: both checks succeed and the final command prints `True`.

- [ ] **Step 3: Confirm clean implementation state**

Run `git status --short`. Expected: no uncommitted implementation changes remain.
