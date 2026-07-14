# Cluster Expansion and Single-Footprint Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a cluster expansion visibly reveals its individual markers and give every valid footprint card a direct map-location command.

**Architecture:** `ClusterMarkers` defines the zoom where MarkerCluster stops grouping markers. `ClusterFootprintSheet` uses that same zoom for expansion and for an individual card's location action, keeping all navigation local to the Leaflet map while preserving the existing selection callback.

**Tech Stack:** React 18, react-leaflet, Leaflet.markercluster, lucide-react, Vitest, Testing Library.

---

### Task 1: Make Cluster Expansion Reach Individual Markers

**Files:**
- Modify: `frontend/src/components/ClusterMarkers.jsx`
- Modify: `frontend/src/components/map/ClusterFootprintSheet.jsx`
- Modify: `frontend/src/components/__tests__/ClusterMarkers.test.jsx`
- Modify: `frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx`

- [ ] **Step 1: Write the failing tests**

Capture marker-cluster options and require `disableClusteringAtZoom: 17`. Update the sheet expectation to require `maxZoom: 17` from an initial zoom of 8. This proves the command is no longer capped to current zoom plus two.

    expect(capturedClusterOptions).toMatchObject({ disableClusteringAtZoom: 17, zoomToBoundsOnClick: false });
    expect(mocks.map.fitBounds).toHaveBeenCalledWith(selection.bounds, { padding: [48, 96], maxZoom: 17 });

- [ ] **Step 2: Run test and verify RED**

Run `npm.cmd --prefix frontend test -- --run src/components/__tests__/ClusterMarkers.test.jsx src/components/map/__tests__/ClusterFootprintSheet.test.jsx`.

Expected: the options assertion fails and the sheet passes `10` as `maxZoom`.

- [ ] **Step 3: Implement the shared expansion zoom**

Export `CLUSTER_EXPANSION_ZOOM = 17` from `ClusterMarkers.jsx`. Pass it as `disableClusteringAtZoom` to `L.markerClusterGroup`, import it into `ClusterFootprintSheet.jsx`, and use `maxZoom: CLUSTER_EXPANSION_ZOOM` for `map.fitBounds`.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

Run `git add frontend/src/components/ClusterMarkers.jsx frontend/src/components/map/ClusterFootprintSheet.jsx frontend/src/components/__tests__/ClusterMarkers.test.jsx frontend/src/components/map/__tests__/ClusterFootprintSheet.test.jsx` and `git commit -m "fix: fully expand clustered map markers"`.

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
