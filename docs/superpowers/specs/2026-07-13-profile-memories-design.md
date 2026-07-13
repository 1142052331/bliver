# Phase 7: Profile and Memories Design

## Scope

Phase 7 upgrades the signed-in `Me` destination from a navigation bridge that opens the legacy profile drawer into a personal space for identity, geographic memory, and private controls. Public profiles remain open and continue to use the existing profile API and footprint authorization rules. No new visibility semantics, follow graph, or historical backfill is introduced.

## Recommended approach

Add a `MeExperience` destination surface that composes the existing profile payload with three focused views: Overview, Timeline, and Photos. The overview keeps the map-first context by showing a compact personal footprint summary and explicit entry points into the map, timeline, and photo memory surfaces. Timeline and Photos reuse existing `TimelineDrawer` and `PhotoWall` behavior through callbacks instead of duplicating data access. The existing `ProfileDrawer` remains the compatibility surface for other users and for deep links.

The experience uses Natural City tokens: warm paper surfaces, forest primary actions, coral only for check-in/publish, compact sans-serif hierarchy, 44px controls, and one major sheet at a time. The memorable element is a small “memory route” strip that connects the latest places chronologically; it is functional (selecting a stop opens the footprint detail) rather than decorative.

## Data and state

- `useProfileData(currentUser._id)` remains the single profile data source and continues to enforce server-authorized footprint visibility.
- `MeExperience` owns only the active tab and local loading/error/empty rendering.
- Existing `onSelectFootprint`, `onOpenTimeline`, `onOpenPhotoWall`, `onOpenSettings`, and `onLogout` callbacks keep navigation in `App`.
- Visitors render only when the profile response includes `profileVisitors`; the backend remains the authority for owner/admin gating.
- Blocked or missing profiles use the existing not-found state and never expose cached footprint rows.

## UI contract

- Header: avatar, name, edit affordance, compact stats, and a clear privacy/settings entry point.
- Tabs: `概览`, `时间线`, `照片`; selected state uses forest fill and text, not color alone (aria-current and label are present).
- Overview: memory route strip (latest five authorized footprints), empty state with check-in action, and two entry rows for visitors/privacy.
- Timeline/Photos: invoke existing drawer/wall surfaces and return to Me without changing destination state.
- Mobile: full-height destination surface above bottom navigation; desktop: centered max-width panel with the same information architecture.
- Reduced motion removes route-strip transitions; focus states and safe-area padding are required.

## Error handling and tests

- Loading uses `ProfileSkeleton`.
- Fetch failure shows a retry action and preserves the navigation shell.
- Empty history explains the next action (check in) without marketing copy.
- Component tests cover tab semantics, owner-only visitors, route-stop selection, and callback wiring at mobile and desktop widths.
- Existing profile HTTP tests remain unchanged; add no migration or geocoding work.

