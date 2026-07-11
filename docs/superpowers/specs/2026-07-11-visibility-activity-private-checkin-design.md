# Bliver Visibility, Unified Activity, and Privacy-Aware Check-in

## Summary

This delivery combines roadmap Phase 3 and Phase 5 so footprint visibility becomes enforceable at the same time that public discovery and the unified Activity page launch. It adds explicit footprint audiences, structured region metadata, a 24-hour public discovery window, a server-authoritative Activity API, a full Activity destination, and a check-in flow that makes audience and location precision visible before publication.

The existing map, `/api/footprints/today`, and `TimelineDrawer` remain available as rollback surfaces until the new path passes production acceptance.

## Confirmed Product Decisions

- Guests can read eligible public Activity items.
- New users' first footprint audience defaults to `public`; later check-ins reuse the user's most recent choice.
- All legacy footprints are treated as public, receive structured region backfill, and enter public discovery for a fresh 24-hour window beginning when their backfill succeeds.
- After that discovery window expires, a legacy footprint remains in the author's history but leaves stranger discovery under the same rules as a newly published public footprint.
- Location denial falls back to global Activity and never blocks reading the map or Activity.
- Location permission reminders are contextual rather than launch-time interruptions. Ordinary reminders have a seven-day cooldown; explicit user actions that require location may always show guidance.

## Data Model

### Footprint

Add these fields to `Footprint`:

- `visibility`: enum `public | friends | private`, required for newly created and backfilled footprints.
- `locationPrecision`: enum `approximate | precise`.
- `countryCode`: normalized ISO-style country code when available.
- `countryName`: display name returned by structured reverse geocoding.
- `regionCode`: normalized first-level administrative region code when available.
- `regionName`: first-level administrative region display name.
- `discoveryExpiresAt`: the point after which a public footprint leaves stranger discovery.
- `regionBackfill`: status metadata containing `status`, `attempts`, `lastAttemptAt`, and an optional bounded error string.

Indexes support visibility authorization and descending discovery queries:

- `{ visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 }`
- `{ countryCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 }`
- `{ countryCode: 1, regionCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 }`
- `{ userId: 1, createdAt: -1, _id: -1 }`

### User

Add `lastFootprintVisibility` with enum `public | friends | private` and default `public`. The backend updates it only after a successful footprint publication.

The client may cache the last selection for immediate form initialization, but the authenticated user value returned by the server is authoritative.

## Visibility Policy

One shared backend policy controls the map, Activity, footprint detail, profiles, and interaction mutations.

- `public`: visible to anyone while in public discovery; after discovery expiry it remains visible to the author and accepted friends. Direct access by strangers after expiry is denied.
- `friends`: visible only to the author and accepted friends.
- `private`: visible only to the author.
- Admin access continues to follow the existing explicit administrative policy and never leaks administrative visibility into ordinary API responses.

All reaction and comment mutations first enforce read visibility. Phase 4 may extend comment structure, but it must reuse this policy rather than implement a separate audience check.

## Structured Reverse Geocoding

Reverse geocoding returns a structured object rather than only a display string:

- `displayName`
- `countryCode`
- `countryName`
- `regionCode`
- `regionName`

The service continues caching rounded coordinates. A geocoding failure does not fail publication: the footprint is stored with the available display value, participates in global discovery when public, and is marked for a later metadata retry.

## Legacy Footprint Backfill

A dedicated resumable script processes footprints that lack visibility or structured region metadata.

- It operates in bounded batches and throttles reverse-geocoding requests.
- It persists progress through per-record status plus the last processed `_id`, allowing safe restart after interruption.
- Successful records receive `visibility: public`, inferred location precision, structured country and region metadata, and `discoveryExpiresAt = backfillCompletionTime + 24 hours`.
- Failed records keep a bounded error description and retry count. They remain eligible for a later retry batch.
- Re-running the script is idempotent and does not extend the discovery window of already completed records.
- The script prints processed, succeeded, skipped, and failed totals and supports a dry-run mode.

## Activity API

Add the guest-readable `GET /api/activity` endpoint with optional authentication.

### Inputs

- `scope`: `smart | region | country | global`, default `smart`.
- `countryCode` and `regionCode` for an explicit fixed scope.
- `cursor`: opaque encoding of `createdAt + _id`.
- `limit`: bounded page size.

### Server Selection

`ActivityService` owns candidate selection and response decoration.

For authenticated users it includes all currently readable friend and owner items. Public stranger candidates must still be inside `discoveryExpiresAt`. Guests receive only current public discovery candidates.

Smart scope fills candidates in this order:

1. accepted friends and the current user;
2. matching first-level administrative region;
3. matching country;
4. global public discovery.

The service de-duplicates footprint IDs between candidate sets, then sorts the final page strictly by `createdAt DESC, _id DESC`. Friendship never boosts rank. Candidate priority only determines which items can fill the requested page.

Fixed `region`, `country`, and `global` scopes disable supplementation. A fixed scope still includes readable owner and friend content only when it matches that selected geography; the UI describes the fixed scope instead of calling it smart discovery.

### Response

Each item includes the sanitized footprint plus server-derived metadata:

- `relationship`: `self | friend | stranger`.
- `sourceScope`: `friend | region | country | global`.
- `sourceLabel`: localized display text such as `好友`, `同省`, `同国`, or `全球`.
- `canInteract`: whether the current viewer may react or comment.

The page response includes `nextCursor`, `hasMore`, the requested scope, the scopes actually used, and resolved location context. Cursor comparison uses both timestamp and identifier to avoid duplicates or omissions for equal timestamps.

## Activity Page

The Activity bottom-navigation destination becomes a full page and no longer invokes `TimelineDrawer`.

### Layout

- A stable page header names the destination and keeps scope controls reachable.
- The selected scope appears as a concise chip. A separate control opens region/country/global selection.
- When location context is unavailable, a calm inline notice explains the global fallback and offers permission guidance without blocking content.
- The content stream is a single chronological column. Cards use the shared hierarchy: identity and relationship, place and time, message, media, then reaction/comment affordances.
- Relationship and geographic source labels are text-backed and never communicated by color alone.
- Loading uses structural skeletons. Empty states explain the selected scope and offer either a broader scope or the check-in action. Errors state what failed and provide retry.

The Activity page uses React Query as the server-state source. Socket footprint events invalidate or surgically update matching Activity queries; no parallel Activity array is kept in Zustand.

## Scope and Location Context

Smart discovery uses the browser's current coordinates only to resolve a location context. Precise coordinates are not persisted merely for browsing Activity.

- Denied, unavailable, or timed-out location resolves to global scope.
- Manual fixed-scope selection is persisted locally and overrides smart supplementation.
- A user can clear the fixed scope to return to smart behavior.
- Region and country controls remain understandable when no location exists: unavailable choices explain why and lead to permission guidance or explicit manual selection.

## Contextual Permission Reminders

Location permission reminders appear only when the user:

- presses the map locate control;
- requests smart nearby/region discovery without location context;
- chooses precise location while publishing.

Ordinary reminders store a timestamp and respect a seven-day cooldown. Explicit user-initiated location actions bypass the cooldown because they are direct requests rather than unsolicited reminders. When browser permission is permanently denied, the UI explains how to enable it in browser or system settings instead of repeatedly calling `getCurrentPosition` as though a system prompt will reappear.

## Privacy-Aware Check-in

The existing check-in flow gains two continuously visible decisions near the publish action.

### Audience

- `public`: strangers may discover the footprint for 24 hours; after expiry it remains in the author's history and is readable by accepted friends.
- `friends`: only the author and accepted friends can read it.
- `private`: only the author can read it.

The first selection defaults to `public`. Later check-ins initialize from `lastFootprintVisibility`. Explanatory copy states what happens after the discovery window.

### Location Precision

- `approximate`: displays a blurred coordinate and explains the approximate radius.
- `precise`: displays the submitted coordinate and, when location access is unavailable, invokes contextual permission guidance.

The map preview and publish button summarize the effective audience and location precision. The primary button uses explicit copy such as `公开发布`, `仅好友发布`, or `私密保存`.

### Submission and Failure Recovery

The client sends audience and precision with the existing check-in payload. The backend validates both and never trusts a client-supplied discovery expiry or region value.

- Image upload failure allows retry or removing the image while preserving the form.
- Reverse-geocoding failure does not block footprint creation.
- Footprint creation failure preserves message, mood, image selection state, audience, precision, and map position for retry.
- `lastFootprintVisibility` changes only after a successful creation.

## Data Flow and Cache Updates

1. Check-in validates audience and precision.
2. The backend derives display coordinates, structured geography, and discovery expiry.
3. The footprint is stored and sanitized through the shared visibility policy.
4. A domain event is emitted.
5. Map and Activity React Query caches are updated or invalidated according to their keys and viewer context.
6. The Activity page re-renders in true chronological order.

## Error and Edge States

- Guest Activity: public discovery only; interaction opens authentication without losing the selected item.
- No location: global fallback with an explanatory notice.
- Empty region/country: smart mode supplements from broader scopes; fixed scope stays empty and offers a broader selection.
- Offline or slow network: cached Activity remains visible when available, with stale/retry messaging.
- Expired discovery while paging: server authorization and cursor logic prevent the item from reappearing.
- Deleted or newly private item: socket invalidation removes it from caches; direct fetch is denied if no longer readable.
- Failed backfill: reported and retryable without blocking deployment.

## Testing

### Backend

- guest, stranger, friend, owner, and admin visibility authorization;
- interaction authorization using the shared visibility policy;
- 24-hour expiry for new and backfilled footprints;
- legacy backfill dry-run, idempotency, resume, failure recording, and fresh discovery window;
- structured geocoding fallback;
- smart region-country-global fill order;
- fixed scopes without supplementation;
- candidate de-duplication;
- strict `createdAt + _id` ordering and cursor pagination;
- server-derived relationship and source labels.

### Frontend

- Activity destination no longer opens `TimelineDrawer`;
- guest public Activity and login-gated interaction;
- smart and fixed scope controls;
- location-denied global fallback;
- contextual reminder triggers and seven-day cooldown;
- Activity source labels, skeleton, empty, retry, and long-content states;
- first-public and remembered audience initialization;
- audience and precision preview copy;
- form retention after upload or creation failure.

### Browser Acceptance

Validate 360×800, 390×844, 430×932, and desktop layouts. Cover safe areas, dynamic keyboard behavior, long place names, tall images, Activity scrolling, slow network, offline cache, denied location, empty discovery, and failed publication.

## Deployment and Rollback

1. Deploy the backward-compatible backend and indexes.
2. Run the legacy backfill in dry-run mode, then bounded live batches.
3. Review counts and the failed-record report.
4. Deploy the frontend Activity and privacy-aware check-in surfaces.
5. Monitor authorization denials, Activity latency, geocoding failures, backfill failures, and publication errors.

The old `/api/footprints/today` endpoint and `TimelineDrawer` stay intact. If Activity fails acceptance, the navigation bridge can temporarily return to the legacy timeline without rolling back the data model. Secondary legacy surfaces are removed only during Phase 8 hardening.

## Deferred Work

This delivery does not add two-level public comments, moderation/reporting, stranger greetings, conversation unlocking, blocking, the new Messages page, the new profile/Me page, or route-level code splitting. Those remain in roadmap Phases 4, 6, 7, and 8.
