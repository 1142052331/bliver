# Phase 8: Legacy Surface Adaptation and Hardening

## Scope

Phase 8 adapts the remaining legacy admin, photo wall, and announcement surfaces to the Natural City design system and hardens their loading, accessibility, performance, observability, and regression behavior. Existing functionality and the legacy destination bridge remain available. This phase does not change authentication rules, footprint visibility policy, historical geography, deployment, or data backfill.

## Design Decisions

### Legacy surface theme

`AdminPanel`, `PhotoWall`, and `AnnouncementPanel` keep their current modal/sheet presentation and z-index ownership, but use the committed Natural City tokens from `frontend/src/styles/tokens.css`: paper background, surface panels, forest text/navigation, coral for publication and destructive attention, and semantic border/shadow tokens. Aurora gradients, glow shadows, and black glass backgrounds are removed from these three surfaces. Existing admin tab content receives the same scoped theme through a shared `bliver-legacy-surface` wrapper so the panel remains coherent without changing tab responsibilities.

Each surface has a semantic heading and dialog label, a labelled close control, visible keyboard focus, minimum 44px interactive targets, and actionable loading/empty/error states. Images provide meaningful alt text (or empty alt for decorative avatars), use asynchronous decoding and lazy loading where appropriate, and render a stable placeholder after load failure.

### Route and bundle loading

`App.jsx` lazy-loads the three legacy surfaces with `React.lazy`. A shared `LegacySurfaceFallback` is rendered inside `Suspense` and respects safe-area padding. The lazy boundary is only mounted when the corresponding UI state is open, preserving initial map startup. A lazy import failure is reported and rendered by the existing `ErrorBoundary`.

### Performance

`PhotoWall` memoizes photo cards, uses stable `aspect-ratio`/containment for masonry items, asynchronous image decoding, and no decorative infinite animation. Announcement resize handling is replaced with a `matchMedia` subscription. Admin refreshes do not create work after unmount, and tab content keeps bounded scroll containers.

### Observability

The frontend adds `frontend/src/observability.js` with a small `recordMetric(name, detail)` contract. It dispatches a `bliver:telemetry` `CustomEvent` for local diagnostics and adds a Sentry breadcrumb when Sentry is configured; payloads contain event names, durations, status, and surface identifiers only. Legacy surfaces record open, load success, load failure, and action failure events.

The backend adds request context middleware that creates or forwards an `X-Request-Id`, records response count and duration by method/path/status in an in-memory bounded aggregate, and logs only request id, method, path, status, and duration. `GET /healthz` returns `{ status, uptime, requests }` without authentication. Existing Sentry setup and error response format remain unchanged.

## Data Flow and Failure Behavior

Legacy surface open -> lazy import -> fallback -> surface fetch -> success or actionable error. Closing a surface restores focus to the triggering control when a ref is available. Fetch failures show a retry control and emit an error metric; action failures preserve form state and show an inline alert/toast. `healthz` is always safe to call and never exposes user data.

## Testing and Acceptance

- Frontend tests prove the lazy fallback is rendered while a surface chunk is pending, theme wrappers expose semantic dialog labels, image failures remain accessible, and telemetry emits the expected event names without user content.
- Backend tests prove request ids are returned, healthz reports uptime and bounded aggregates, and metrics do not include authorization or body data.
- Existing admin, photo, announcement, shell, map, activity, profile, messaging, and notification tests remain green.
- `npm run typecheck`, `npm run build`, `npm test`, backend Jest, and `git diff --check` must pass. No push, deployment, or real geography backfill is performed.

## Non-goals

- No new admin capabilities or moderation policy changes.
- No redesign of the primary map, activity, messages, profile, or check-in surfaces.
- No migration of legacy footprint visibility or geography.
