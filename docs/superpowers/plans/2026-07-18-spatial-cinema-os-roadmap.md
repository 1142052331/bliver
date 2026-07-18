# Spatial Cinema OS Execution Roadmap

**Source specification:** `docs/superpowers/specs/2026-07-18-spatial-cinema-os-design.md`

The approved design spans multiple independently testable subsystems. It is
implemented through seven focused plans so each milestone remains runnable,
reviewable, and reversible. A later plan may depend on interfaces produced by
an earlier milestone, but no milestone may silently expand the previous one's
scope.

## Execution Order

1. `2026-07-18-spatial-cinema-foundation.md`
   - Natural City tokens and primitives
   - Simplified Chinese, English, and Japanese runtime
   - responsive four-destination app shell
   - global error/loading/session surfaces
2. `2026-07-18-spatial-maplibre-migration.md`
   - MapLibre parity replacement
   - provider configuration and CSP
   - semantic footprint list and 2D fallback
   - Leaflet removal after parity gates
3. `2026-07-18-spatial-three-layer.md`
   - Three.js custom map layer
   - capability tiers and renderer cleanup
   - data-driven footprint beacons and time trails
4. `2026-07-18-chrono-lens-journeys.md`
   - Chrono Lens
   - map-to-detail, publish-success, and memory transitions
   - cancellable motion and media failure behavior
5. `2026-07-18-product-surface-convergence.md`
   - Activity, messages, profile/memories, and notifications
   - shared hierarchy, density, media, and state vocabulary
6. `2026-07-18-auth-admin-state-convergence.md`
   - authentication, sessions, moderation/admin
   - complete error, empty, loading, offline, and pending-action coverage
   - complete three-language resource coverage
7. `2026-07-18-spatial-cinema-release-acceptance.md`
   - six-view visual regression
   - WebGL canvas pixel evidence
   - accessibility, performance, memory, Capacitor, and release evidence

## Cross-Milestone Rules

- Use TDD for behavior and contract changes.
- Commit after every independently passing task.
- Preserve V2 API, privacy, and module boundaries.
- Never make Three.js authoritative for business state.
- Never hide functionality behind motion or WebGL.
- Do not start a milestone until its predecessor's exit gate is recorded.
- A newer candidate SHA requires fresh release evidence.
- Real environment values, map provider keys, screenshots containing private
  content, and user data are never committed.

## Milestone Exit Gates

| Milestone | Required evidence |
| --- | --- |
| Foundation | three locales, shell, primitives, global states, six viewports |
| MapLibre | map parity, attribution/CSP, semantic list, fallback, Leaflet absent |
| Three layer | nonblank canvas, correct projection, reduced tier, cleanup |
| Chrono Lens | cancellable spatial transitions and exact pending-action recovery |
| Product surfaces | complete daily workflows share one visual vocabulary |
| Auth/admin/states | operational surfaces and all state matrices complete in three locales |
| Release | performance, accessibility, real-device, backup/deploy/observation evidence |

## Rollback Boundary

Each milestone is a sequence of small commits. Roll back the latest milestone
as a whole if its exit gate fails. Do not create long-lived feature flags for
two production map engines. Capability tiers are product behavior, not a
temporary migration flag.
