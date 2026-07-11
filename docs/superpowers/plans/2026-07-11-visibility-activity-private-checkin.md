# Visibility, Unified Activity, and Privacy-Aware Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship server-enforced footprint audiences, resumable legacy geography backfill, guest-readable chronological Activity, and a privacy-aware check-in flow on the existing Natural City shell.

**Architecture:** Extend the Phase 2 query and visibility foundations instead of creating parallel policy or cache paths. The backend remains authoritative for visibility, discovery expiry, geography, relationship decoration, and cursor order; React Query owns Activity server state; the existing location context owns smart/fixed scope; transient sheets and selections stay local to their components.

**Tech Stack:** Express 5, Mongoose 9, Zod 4, Jest/Supertest, React 19, TanStack React Query 5, Zustand 5, Vite/Vitest, Tailwind/CSS, Lucide React.

---

### Task 1: Lock Publication and User Preference Contracts

**Files:**
- Modify: `backend/models/User.js`
- Modify: `backend/validators/schemas.js`
- Modify: `backend/__tests__/footprint-read.test.js`
- Create: `backend/__tests__/footprint-publication.test.js`

- [ ] Write failing model and request-validation tests for `lastFootprintVisibility`, `visibility`, and `locationPrecision`.
- [ ] Run the focused backend tests and confirm the new assertions fail for missing contracts.
- [ ] Add the user field and strict Zod enums without accepting client geography or discovery expiry.
- [ ] Run the focused tests and commit the contract.

### Task 2: Make Check-in Derive Privacy and Geography

**Files:**
- Modify: `backend/services/FootprintService.js`
- Modify: `backend/services/nominatim.js`
- Modify: `backend/services/location.js`
- Modify: `backend/routes/api.js`
- Modify: `backend/routes/map.js`
- Modify: `backend/socket/index.js`
- Create: `backend/socket/footprintPublisher.js`
- Modify: `backend/validators/schemas.js`
- Test: `backend/__tests__/footprint-publication.test.js`
- Test: `backend/__tests__/footprint-publication-service.test.js`
- Test: `backend/__tests__/footprint-socket-publication.test.js`
- Test: `backend/__tests__/location-sanitizer.test.js`
- Test: `backend/__tests__/map-query.test.js`
- Test: `backend/__tests__/nominatim.test.js`

- [ ] Write failing tests for first-public default, remembered audience, 24-hour expiry, approximate/precise coordinates, structured geography, geocoder failure fallback, and coordinate bounds.
- [ ] Write failing Socket tests proving public global delivery, friends/owner/admin targeting, private owner/admin targeting, de-duplicated rooms, ID-only deletion, and contained async listener failures.
- [ ] Run the tests and verify the failure is in publication behavior.
- [ ] Derive display coordinates, geography, precision, and expiry in `FootprintService`; update the user preference only after creation succeeds.
- [ ] Preserve durable publication when reverse geocoding or post-create preference/streak maintenance fails, while marking stable retry metadata and diagnostics.
- [ ] Fall back to the created footprint when post-create populated readback is unavailable, while still returning and emitting a privacy-safe publication.
- [ ] Blur approximate coordinates with bounded spherical destination math that remains finite at poles and normalizes dateline crossings.
- [ ] Relay footprint events through recipient-aware Socket rooms using accepted friendships and explicit admin roles; never globally emit non-public payloads.
- [ ] Strip operational geocoder/backfill metadata from public HTTP and Socket payloads.
- [ ] Run the focused tests and commit the publication and Socket privacy infrastructure.

### Task 3: Enforce Visibility on Interactions

**Files:**
- Modify: `backend/services/FootprintService.js`
- Modify: `backend/routes/api.js`
- Modify: `backend/services/FootprintReadService.js`
- Test: `backend/__tests__/footprint-read.test.js`
- Test: `backend/__tests__/footprint-visibility-policy.test.js`

- [ ] Add failing guest/stranger/friend/owner/admin tests for detail, reaction, comment, and comment deletion.
- [ ] Verify unauthorized reads and mutations currently reach the data.
- [ ] Reuse `FootprintVisibilityPolicy` for every read and interaction mutation.
- [ ] Return consistent 403/404 responses without leaking hidden footprint content.
- [ ] Run focused tests and commit the authorization enforcement.

### Task 4: Add Resumable Legacy Geography Backfill

**Files:**
- Create: `backend/services/FootprintBackfillService.js`
- Create: `backend/scripts/backfill-footprint-geography.js`
- Create: `backend/__tests__/footprint-backfill.test.js`
- Modify: `backend/package.json`

- [ ] Write failing tests for dry run, bounded batches, idempotency, resume cursor, fresh 24-hour discovery, and bounded failure records.
- [ ] Run the focused test and verify no backfill implementation exists.
- [ ] Implement a dependency-injected batch service and a CLI supporting dry-run, limit, cursor, delay, and retry-failed options.
- [ ] Ensure completed records are never given a later discovery expiry by reruns.
- [ ] Run focused tests and commit the backfill path.

### Task 5: Define Activity Query and Cursor Contracts

**Files:**
- Create: `backend/validators/activityQuery.js`
- Create: `backend/services/ActivityCursor.js`
- Create: `backend/__tests__/activity-query.test.js`

- [ ] Write failing tests for scope codes, bounded limit, opaque cursor decoding, malformed cursor rejection, and equal-timestamp ordering.
- [ ] Run the focused tests and confirm the contracts are absent.
- [ ] Implement normalized activity input and a versioned `createdAt + _id` cursor.
- [ ] Run focused tests and commit the query contract.

### Task 6: Build Server-Authoritative Activity Selection

**Files:**
- Create: `backend/services/ActivityService.js`
- Create: `backend/__tests__/activity-service.test.js`
- Reuse: `backend/services/FootprintQueryService.js`
- Reuse: `backend/policies/FootprintVisibilityPolicy.js`

- [ ] Write failing tests for guest visibility, owner/friend inclusion, smart region-country-global fill, fixed scopes, de-duplication, strict chronology, pagination, and source decoration.
- [ ] Run the focused tests and capture the missing service failure.
- [ ] Implement bounded candidate queries and merge results strictly by `createdAt DESC, _id DESC`.
- [ ] Derive relationship, source scope/label, interaction capability, used scopes, and resolved context on the server.
- [ ] Run focused tests and commit the service.

### Task 7: Expose Guest-Readable Activity API

**Files:**
- Create: `backend/routes/activity.js`
- Modify: `backend/index.js`
- Create: `backend/__tests__/activity-api.test.js`

- [ ] Write failing Supertest cases for guest, authenticated smart scope, fixed scope, cursor page, invalid input, and hidden content.
- [ ] Verify `/api/activity` is absent.
- [ ] Register an optional-auth route that delegates selection and decoration to `ActivityService`.
- [ ] Run focused API tests and commit the endpoint.

### Task 8: Add Activity Client Query State

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/domain/activityQuery.ts`
- Create: `frontend/src/hooks/useActivityFeed.jsx`
- Create: `frontend/src/domain/__tests__/activityQuery.test.ts`
- Create: `frontend/src/hooks/__tests__/useActivityFeed.test.jsx`

- [ ] Write failing tests for canonical scope parameters, viewer-isolated query keys, infinite cursor pages, and invalidation compatibility.
- [ ] Run the focused frontend tests and verify the client contract is missing.
- [ ] Implement the Activity API adapter, normalized query state, and infinite React Query hook.
- [ ] Run focused tests and commit the client data layer.

### Task 9: Build the Natural City Activity Destination

**Files:**
- Create: `frontend/src/components/activity/ActivityPage.jsx`
- Create: `frontend/src/components/activity/ActivityScopeSheet.jsx`
- Create: `frontend/src/components/activity/ActivityCard.jsx`
- Create: `frontend/src/components/activity/ActivityStates.jsx`
- Create: `frontend/src/components/activity/__tests__/ActivityPage.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] Write failing component tests for guest public content, relationship/source labels, strict rendered order, fixed/smart scope, login-gated interaction, skeleton, cached error, empty, retry, long text, and tall media.
- [ ] Run focused tests and verify the destination is absent.
- [ ] Implement one chronological column with a stable header, 44px controls, text-backed labels, structural skeletons, and actionable states.
- [ ] Apply the approved Natural City tokens: map-derived forest/sage hierarchy, coral only for check-in/urgent attention, no glass, glow, nested cards, or decorative motion.
- [ ] Run focused tests and commit the Activity surface.

### Task 10: Replace the Legacy Activity Bridge

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/shell/LegacyDestinationBridge.jsx`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx`
- Modify: `frontend/src/components/shell/__tests__/LegacyDestinationBridge.test.jsx`

- [ ] Change tests so the Activity destination renders `ActivityPage` and never opens `TimelineDrawer`.
- [ ] Run focused tests and verify the legacy bridge still opens the drawer.
- [ ] Mount Activity as a destination surface while keeping the legacy drawer available only through explicit history entry points.
- [ ] Preserve map, messages, Me, auth layering, and bottom-navigation clearance.
- [ ] Run focused tests and commit the navigation switch.

### Task 11: Add Contextual Location Permission Guidance

**Files:**
- Create: `frontend/src/domain/locationReminder.ts`
- Create: `frontend/src/components/LocationPermissionNotice.jsx`
- Modify: `frontend/src/hooks/useLocationContext.js`
- Modify: `frontend/src/components/map/MapScopeControl.jsx`
- Create: `frontend/src/domain/__tests__/locationReminder.test.ts`
- Modify: `frontend/src/hooks/__tests__/useLocationContext.test.jsx`

- [ ] Write failing tests for seven-day cooldown, explicit-action bypass, denied-permission guidance, and passive no-prompt startup.
- [ ] Run focused tests and verify reminder state is absent.
- [ ] Implement per-viewer reminder storage and contextual guidance shared by map, Activity, and check-in.
- [ ] Ensure denied permission falls back to global and never loops `getCurrentPosition`.
- [ ] Run focused tests and commit permission guidance.

### Task 12: Redesign Check-in Privacy Decisions

**Files:**
- Modify: `frontend/src/components/CheckInModal.jsx`
- Modify: `frontend/src/__tests__/CheckInModal.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] Write failing tests for first-public and remembered initialization, audience/precision summaries, explicit publish labels, request payload, contextual precise-location guidance, and retained form state after failures.
- [ ] Run focused tests and verify the old black-glass form lacks the contracts.
- [ ] Reshape the modal with continuously visible audience and precision decisions near publishing, using plain Chinese consequence copy.
- [ ] Preserve message, mood, image, position, visibility, and precision after upload or creation failure.
- [ ] Run focused tests and commit the privacy-aware form.

### Task 13: Integrate Realtime and Cache Reconciliation

**Files:**
- Modify: `frontend/src/hooks/socketHandlers.js`
- Modify: `frontend/src/hooks/__tests__/socketHandlers.test.js`
- Modify: `frontend/src/components/FootprintDetailModal.jsx`
- Modify: `frontend/src/components/__tests__/FootprintDetailModal.test.jsx`

- [ ] Write failing tests for new/update/delete invalidation across map and all Activity pages, including an item becoming private or expiring.
- [ ] Run focused tests and verify stale Activity pages remain possible.
- [ ] Centralize list invalidation and preserve optimistic read-state updates across paged Activity data.
- [ ] Run focused tests and commit realtime reconciliation.

### Task 14: Verify UI, Accessibility, and Production Readiness

**Files:**
- Create: `docs/qa/visibility-activity-checkin-checklist.md`
- Create: `.impeccable/critique/<timestamp>__frontend-src-components-activity-activitypage-jsx.md`
- Modify tests only when a real acceptance gap is found.

- [ ] Run backend tests, frontend tests, frontend typecheck, production build, and `git diff --check`.
- [ ] Build and inspect production UI at 360x800, 390x844, 430x932, and desktop using the in-app browser.
- [ ] Cover guest Activity, smart/fixed scope, no location, loading, empty, cached/error, long content, tall media, check-in audience/precision, keyboard, and failure retention.
- [ ] Run Impeccable design review plus deterministic detector after the visual assessment; fix all P0/P1 findings.
- [ ] Record environmental limitations without claiming unobserved browser states.
- [ ] Stop preview processes, reset temporary viewport overrides, finalize browser tabs, run the full gate again, and commit the QA evidence.

## Deployment Hold

Do not push, merge, deploy, or run the live backfill in this phase. The backfill CLI is implemented and tested locally; actual dry-run/live execution waits for the shared eight-phase release window approved by the user.
