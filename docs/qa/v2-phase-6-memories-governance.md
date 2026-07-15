# V2 Phase 6 QA: Memories, Notifications, and Governance

Date: 2026-07-16
Baseline: `3304aae` (Phase 5)
Final implementation commits: `3cfb5e5`, `86bd2c4`, `9157f5b`, `01e720d`, `bca6500`, `39ad0b2`, `6c1c0de`, `ad82cb2`, `99a3d04`, `31f7441`

## Scope verified

- Memories are read projections over Footprints. Every map, timeline, photo and visitor query passes through `FootprintVisibilityPolicy`; social blocks are evaluated by the existing relationship policy. Owner/private, friend-visible, expired public discovery and blocked-viewer cases are covered by application tests.
- `profile_visitors`, `memory_highlights`, projection event deduplication and the continuous migration `0009_memories_notifications_moderation.sql` are present. Existing footprint/media facts are not copied into profile documents.
- `/me`, `/me/map`, `/me/timeline`, `/me/photos`, `/me/visitors`, visibility-aware profile memories, `/notifications` and `/admin` are route-level V2 workspaces. The browser flow uses the shared footprint detail route and keeps admin UI out of user feature packages.
- Notifications consume outbox/domain events, deduplicate by event id, honor blocked actors and preferences, expose read/read-all/preferences APIs, and only expose safe target references. Push delivery is optional: missing VAPID config, replacement/unsubscribe, expired subscription cleanup and retry limits are covered; provider failure never removes in-app notifications.
- Moderation preserves Phase 4 report intake and adds database-authoritative roles, cases, actions and immutable audit rows. Destructive commands require a fresh role lookup, an open case and a reason; Postgres writes mutation, before/after audit and outbox event in one transaction. No display-name privilege path remains.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm.cmd run architecture:check` | PASS, 301 modules / 640 dependencies, no violations |
| `npm.cmd run typecheck:v2` | PASS |
| `npm.cmd run lint:v2` | PASS |
| `npx.cmd vitest run --config vitest.config.ts --pool=threads --maxWorkers=1` | PASS, 74 files: 263 passed, 7 skipped (270 tests) |
| `npm.cmd run build:v2` | PASS; Vite emits the existing >500 kB chunk advisory |
| `npx playwright test apps/web/e2e/memories-governance.spec.ts` | PASS, 4/4 (desktop + mobile) |
| `npm.cmd run db:v2:migrate` | BLOCKED: `DATABASE_URL` is not configured in this environment |

The seven skipped tests are the repository's Postgres-gated integration tests. Static SQL/migration assertions do not substitute for a live Postgres/PostGIS run. Because migration execution and live integration remain unavailable, this phase is `DONE_WITH_CONCERNS`; no release tag is created.

## Boundary audit

- Frozen V1 `frontend/` and `backend/` were not modified.
- Phase 7 hardening and Phase 8 cutover behavior were not introduced.
- Discovery remains the read projection owner; Footprints remains the source of footprint facts and interactions; Moderation owns report intake/cases/actions; Notifications only consumes events and owns delivery preferences.
- Private-content access is case-scoped and audited with actor, target, reason, before/after summary and timestamp.
