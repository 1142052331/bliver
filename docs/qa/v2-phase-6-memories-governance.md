# V2 Phase 6 QA: Memories, Notifications, and Governance

Date: 2026-07-16
Baseline: `3304aae` (Phase 5)
Final implementation commits: `3cfb5e5`, `86bd2c4`, `9157f5b`, `01e720d`, `bca6500`, `39ad0b2`, `6c1c0de`, `ad82cb2`, `99a3d04`, `31f7441`, `ed8ace9`, `c937269`, `812afbd`

## Scope verified

- Memories are read projections over Footprints. Production injects the Postgres footprint, media and visitor adapters; the in-memory fallback is limited to tests. Every map, timeline and photo query passes through the history mode of `FootprintVisibilityPolicy`; social blocks remain in the existing relationship policy. Owner/private, friend-visible, public history after discovery expiry, moderation-hidden and blocked-viewer cases are covered by application tests.
- `profile_visitors`, `memory_highlights`, projection event deduplication and the continuous migration `0009_memories_notifications_moderation.sql` are present. Existing footprint/media facts are not copied into profile documents.
- `/me`, `/notifications` and `/admin` are protected by `RequireAuth`; owner/profile timeline, photo and visitor requests preserve the viewed owner id. Browser coverage includes a real Express `createApp` fixture with real registration/session cookies, in addition to deterministic policy mocks.
- Notifications consume the existing reaction/comment/friendship/greeting/message/report/admin event payloads, deduplicate by event id, honor blocked actors and preferences, and expose only safe target references. Production VAPID/Web Push is assembled when configured, service-worker registration is bounded, delivery attempts are persisted, endpoint ownership is enforced across accounts, and provider failure never removes in-app notifications.
- Moderation preserves Phase 4 report intake and adds database-authoritative roles, cases, actions and immutable audit rows. Destructive commands recheck role, locked case state/target and affected rows in the same Postgres transaction before mutation/audit/outbox. Suspended users cannot log in, refresh or resolve sessions; moderation-hidden footprints are excluded from reads/discovery/interactions and cannot be changed or deleted by their author. No display-name privilege path remains.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm.cmd run architecture:check` | PASS, 302 modules / 645 dependencies, no violations |
| `npm.cmd run typecheck:v2` | PASS |
| `npm.cmd run lint:v2` | PASS |
| `npx.cmd vitest run --config vitest.config.ts --pool=threads --maxWorkers=1` | PASS, 74 files: 273 passed, 7 skipped (280 tests) |
| `npm.cmd run build:v2` | PASS; Vite emits the existing >500 kB chunk advisory |
| `npx playwright test apps/web/e2e/memories-governance.spec.ts` | PASS, 6/6 (desktop + mobile, including real app fixture) |
| `npm.cmd run db:v2:migrate` | BLOCKED: `DATABASE_URL` is not configured in this environment |

The seven skipped tests are the repository's Postgres-gated integration tests. Static SQL/migration assertions do not substitute for a live Postgres/PostGIS run. Because migration execution and live integration remain unavailable, this phase is `DONE_WITH_CONCERNS`; no release tag is created.

## Boundary audit

- Frozen V1 `frontend/` and `backend/` were not modified.
- Phase 7 hardening and Phase 8 cutover behavior were not introduced.
- Discovery remains the read projection owner; Footprints remains the source of footprint facts and interactions; Moderation owns report intake/cases/actions; Notifications only consumes events and owns delivery preferences.
- Private-content access is case-scoped and audited with actor, target, reason, before/after summary and timestamp.
