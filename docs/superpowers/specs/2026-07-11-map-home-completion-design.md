# Bliver Map Home Completion and Shared UI Architecture

## Summary

This specification completes roadmap Phase 2 after an audit found that the first implementation pass covered map styling, basic markers, a preview card, locate/reset controls, and footprint request states, but omitted the approved search, region, scope, filter, relationship treatment, cluster behavior, tile failure handling, and targeted verification.

Phase 2 is completed on the same development line as the approved combined Phase 3 and Phase 5 work. The map and Activity page share one query contract, one visibility policy, one location context, and one React Query cache model. Phase 2 may land in separate commits, but final acceptance occurs after the shared backend fields and query contracts are available.

## Confirmed Product Decisions

- Map search covers places plus only footprints the current viewer may read.
- Map filters have three groups: relationship, time, and content.
- Geographic scope is a separate control shared with Activity.
- Markers identify self, friend, same region, same country, and global sources with text-backed visual treatment.
- New footprints play one reduced-motion-aware pulse. Unread updates use a static coral dot.
- Check-in streak badges remain in profile experiences and do not compete for space on map markers.
- Cluster selection zooms first. A same-place list opens only after further useful spatial separation is unavailable.
- Map tile failures and footprint data failures are independent states.
- The `impeccable` and `frontend-design` skills govern UI design, implementation critique, and browser visual acceptance for all eight roadmap phases.

## One Shared Domain Architecture for All Eight Phases

### Footprint Visibility Policy

A single backend `FootprintVisibilityPolicy` decides whether a viewer may read or interact with a footprint. Map, Activity, detail, reactions, comments, profiles, photo surfaces, moderation, and later blocking logic call this policy instead of reproducing audience checks.

### Footprint Query Service

A single `FootprintQueryService` normalizes and executes reusable conditions:

- viewer identity and accepted-friend relationships;
- explicit visibility authorization;
- geographic scope;
- relationship filter;
- publication-time filter;
- photo presence;
- unread state where unread is viewer-specific;
- authorized text search;
- stable ordering and pagination.

Map and Activity are two presentations of this domain query. They may expose resource-specific endpoints, but those endpoints call the same policy, query builders, response decorators, and sanitizers.

### Shared Footprint Response

Every core footprint response includes server-derived metadata rather than asking the client to infer authorization:

- `relationship`: `self | friend | stranger`;
- `sourceScope`: `self | friend | region | country | global`;
- localized source label;
- visibility;
- read and interaction capabilities;
- sanitized coordinates and location precision.

Future Phase 4, Phase 6, and Phase 7 work extends this response and policy. It must not create parallel map-only, message-only, or profile-only visibility logic.

### Server and UI State

React Query is the sole frontend source for footprint server state. Socket events update or invalidate matching map, Activity, detail, and profile cache entries. Zustand stores only transient cross-surface UI state, including selected destination, selected footprint, open sheet, and temporary control state.

A shared location context owns:

- resolved country and first-level administrative region;
- browser location permission state;
- current smart or fixed geographic scope;
- manual region selection;
- contextual permission-reminder cooldown.

Map, Activity, and privacy-aware check-in consume this context.

## Map Query Contract

The map query supports these parameters using the shared domain vocabulary.

### Geographic Scope

- `smart`: current region, then country, then global supplementation according to the shared discovery rules;
- `region`: fixed first-level administrative region;
- `country`: fixed country;
- `global`: current globally eligible content.

The scope selection is shared with Activity. Manual fixed scope persists; clearing it returns to smart behavior.

### Relationship Filter

- `all`;
- `self`;
- `friends`;
- `public`.

This filter narrows already-authorized content and never grants access.

### Time Filter

- `24h`;
- `7d`;
- `year`.

Time is evaluated by the backend using publication timestamps. Public discovery expiry remains authoritative regardless of the selected period.

### Content Filter

- `all`;
- `photo`;
- `unread`.

Unread is viewer-specific. Guests cannot select unread and receive an explicit disabled explanation rather than an empty result caused by an implicit login requirement.

### URL State

Scope, relationship, time, content, and search query are represented in shareable URL parameters. Refresh restores valid values. Unknown or unauthorized values fall back to documented defaults and are removed from the canonical URL.

## Unified Search

One map search entry returns two clearly separated result groups.

### Place Results

Place search resolves geographic locations and moves the map to the selected result. A place-search failure does not clear footprint results or current map content.

### Footprint Results

Footprint search matches authorized author names, place names, and footprint message text through the shared query service. Search never returns an identifier, count, snippet, or region hint from a footprint the viewer cannot read.

Selecting a footprint result focuses its map position and opens the preview card. Selecting a place result only changes the viewport.

Search input is debounced, keyboard navigable, cancellable, and resilient to stale responses. Loading, empty, and failure states are scoped independently to place and footprint result groups.

## Map Controls and Responsive Composition

### Mobile

- The existing shell top bar remains visually dominant.
- Search is one lightweight, full-width affordance below the top bar.
- Scope and filter controls occupy a restrained second row using explicit labels and icons.
- Locate and reset remain compact 44-pixel map-edge controls.
- Scope and filter choices open one bottom sheet at a time.
- Search results expand from the search control and avoid covering the bottom navigation or check-in action.

### Desktop

- The same information architecture becomes a narrow side control rail and right-side selection/preview surface.
- Desktop does not stretch mobile sheets across the viewport.
- Map controls remain secondary to the geographic canvas.

Controls use white or sage-tinted surfaces, forest selection, plain product typography, consistent radii, and no decorative blur. Coral remains reserved for publish actions, unread attention, and urgent state.

## Marker System

The marker's primary content is an avatar or mood. A visible ring plus a short text label communicates source:

- self: forest solid ring with `我的`;
- friend: sage/forest supporting ring with `好友`;
- public same region: neutral ring with `同省` or the appropriate first-level administrative label;
- public same country: neutral ring with `同国`;
- global: neutral ring with `全球`.

Labels remain legible at the active zoom and may collapse into accessible title text when spatial density requires it. Color never carries the meaning alone.

Unread updates add a static coral dot. A marker receives the signature pulse only when a footprint first appears in the current viewer's map cache, immediately after successful publication, or when a focus action explicitly calls for spatial emphasis. The pulse plays once and never loops. Reduced-motion mode replaces it with a static selected-state ring.

The marker cache key includes the source treatment, unread state, and selected/pulse state so Leaflet does not reuse visually incorrect icons.

## Bliver Visual Signature

The project-specific visual signature is the **footprint imprint**: a person or mood appears as a light mark pressed into a living city map, and a selected or genuinely new footprint produces one restrained expanding ring that connects social content to its physical place.

This signature is deliberately narrow. Search, filters, scope controls, cards, and sheets remain calm and familiar. Black glass panels, neon radar styling, looping emoji movement, decorative glow, excessive pills, and ornamental animation are prohibited in redesigned core surfaces.

## Selection Preview

Only one preview is open at a time.

- It summarizes identity and source, place and time, the meaningful message line, optional media, unread status, and one clear `查看详情` action.
- Opening a profile, changing destination, selecting a different item, or losing access closes or replaces the preview deterministically.
- If filtering, Socket deletion, visibility changes, or pagination removes the selected footprint, the preview closes automatically.
- Long names and place labels truncate with accessible full text.
- Image failure preserves the rest of the preview and does not collapse its action layout.

The preview preserves map context and does not add a scrim.

## Cluster Behavior and Same-Place Sheet

Cluster markers use the same relationship-aware visual vocabulary in aggregate. They expose count and unread presence without animated glow.

On activation:

1. if the cluster can spatially separate at a higher useful zoom, zoom to its bounds;
2. if the map is already at the configured separation threshold or the children occupy effectively the same coordinate, open the same-place sheet.

The same-place sheet replaces the old black `ClusterDetailPanel` presentation with a Natural City bottom sheet. It lists footprints in descending publication order, preserves source labels and unread state, and enters the same preview/detail path as a single marker. It follows safe areas, supports keyboard escape and focus restoration, and reserves the mobile bottom navigation.

## Loading, Empty, and Failure States

### Footprint Data

- Initial loading uses lightweight structural map placeholders and control skeletons without blocking the whole map with a large centered modal.
- Refresh keeps cached markers visible with a small stale/loading notice.
- Failure keeps the base map and controls visible, states that footprints could not load, and provides retry.
- Empty results distinguish no footprints in the account, no results for current filters, and no results in a fixed scope. Each offers the next relevant action.

### Map Tiles

Tile loading and tile failure are tracked separately from footprint queries.

- Tile failure keeps markers and controls interactive where possible.
- A non-blocking notice says the base map is temporarily unavailable and offers retry.
- Repeated tile errors are bounded so one failing tile does not produce repeated banners.
- Recovery clears the notice after a successful tile load.

### Location

Location denial falls back to global scope. Permission guidance uses the shared contextual reminder rules from the combined Phase 3 and Phase 5 specification.

## UI and Visual Governance for All Eight Phases

Every roadmap phase that creates, reshapes, adapts, or visually reviews UI must apply both the `impeccable` and `frontend-design` skills. Their guidance is subordinate to explicit user decisions and the repository's `PRODUCT.md`, `DESIGN.md`, and approved feature specifications.

Before UI implementation, each phase records:

- the real user scene and the surface's single job;
- information hierarchy and interaction model;
- named color roles and typography scale derived from existing tokens;
- mobile, desktop, keyboard, and safe-area composition;
- the one Bliver-specific visual signature used by the surface;
- loading, empty, error, disabled, offline, and permission states.

Every interactive component covers default, hover where applicable, focus-visible, pressed, selected, disabled, loading, error, and empty behavior. Touch targets are at least 44 by 44 CSS pixels. Chinese body copy is at least 15 pixels. Body text and controls meet WCAG 2.2 AA contrast. Relationship, privacy, scope, moderation, and errors never rely on color alone.

Motion normally lasts 150 to 250 milliseconds and communicates state. Reduced motion is mandatory. Product UI avoids display fonts in controls, gradient text, decorative glassmorphism, side-stripe cards, excessive pill containers, repeated identical card grids, ornamental page-load choreography, and arbitrary z-index values.

Implementation uses the existing Lucide icon family and shared tokens. New screens must not introduce a parallel visual system. The eighth phase performs a final product-wide consistency audit, but earlier phases must finish their own responsive, accessibility, and visual-quality requirements instead of deferring all UI debt.

## Design Critique and Browser Acceptance

UI completion requires visual evidence, not only passing unit tests.

For each redesigned core surface:

1. build and run the real application with representative data;
2. inspect 360×800, 390×844, 430×932, and desktop layouts;
3. capture and inspect screenshots for default plus relevant open-control, loading, empty, error, and long-content states;
4. write an honest critique against the approved brief, information hierarchy, contrast, spacing, map visibility, signature treatment, and prohibited patterns;
5. correct material defects and inspect again;
6. record any accepted deviation or unverified environment limitation.

The screenshot review checks control collisions, map drag area, bottom navigation and check-in overlap, keyboard and safe-area behavior, long place names, tall images, high-density clusters, focus visibility, and reduced motion.

## State Transitions and Edge Cases

- Search or filter changes cancel stale requests and retain usable cached map content.
- A selected footprint removed by permission, filter, deletion, or expiration closes cleanly.
- Scope changes update both map and Activity through shared query keys.
- Guest-only limitations are explicit; they do not masquerade as empty data.
- Offline mode keeps cached markers when possible and identifies stale content.
- URL state does not encode sensitive location coordinates.
- A failed place search cannot expose or erase footprint data.
- Map controls and sheets never create overlapping major surfaces.

## Testing

### Domain and API

- shared query normalization and authorization;
- place search separated from authorized footprint search;
- combinations of relationship, time, content, and scope;
- URL serialization and invalid-value fallback;
- shared response decoration and sanitization.

### Frontend Unit and Integration

- map destination and query-key wiring;
- search debounce, cancellation, grouping, keyboard navigation, and partial failure;
- filter and scope selection and restoration;
- marker source label, unread dot, selection, and pulse cache keys;
- one-time pulse and reduced-motion fallback;
- cluster zoom-first behavior and same-coordinate sheet fallback;
- preview replacement and automatic close when data disappears;
- data loading, refresh, failure, empty, and retry;
- tile failure bounding, retry, and recovery;
- location denial and contextual permission guidance;
- touch targets and accessible names for controls.

### Browser Acceptance

Validate map drag, zoom, search keyboard, scope/filter sheets, marker selection, cluster separation, same-place list, preview, long text, dense data, safe areas, dynamic keyboard, tile failure, footprint failure, offline cache, and reduced motion at every target viewport.

## Delivery and Rollback

Phase 2 UI primitives and tests are committed independently. Shared visibility, geography, and query contracts land with the combined Phase 3 and Phase 5 implementation. Final Phase 2 acceptance occurs after those shared contracts power both map and Activity.

The legacy `/api/footprints/today` endpoint and old timeline/detail entry points remain available during rollout. The existing partial Phase 2 implementation is revised rather than discarded: its preview concept and Natural City marker direction remain, while missing controls, correct pulse behavior, cluster presentation, tile errors, shared querying, and targeted tests are added.

## Deferred Work

This phase does not implement the full Activity page, privacy-aware publishing fields, public threaded comments, stranger greetings, blocking, reports, memories, or final route splitting. It defines and consumes the shared contracts needed by those phases without duplicating their product surfaces.
