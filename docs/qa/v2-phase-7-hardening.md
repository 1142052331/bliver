# V2 Phase 7 QA: Product Hardening

Date: 2026-07-16
Baseline: `7497177` (accepted Phase 6 implementation evidence)
Implementation commits: `666d7a1`, `9732099`, `713cc6d`, `519477e`, `ee8ac80`, `5bb8602`, `c6a0d9d`
Status: `DONE_WITH_CONCERNS`; release acceptance and tag are pending external evidence.

## Scope verified

- Deterministic guest, admin, user A, and user B fixtures cover public/friends/private and precise/approximate footprints. Route journeys, pending guest actions, governance, two-person messaging, block/revoke, real Socket reconnect, offline map fallback, and deep-link auth return run at 360x800, 390x844, 430x932, and 1440x1000.
- Axe, keyboard focus/order, Escape/focus restoration, form errors, 44px controls, safe areas, long content, overflow, and reduced motion are browser gates. Leaflet attribution is visibly underlined rather than excluded from axe.
- The canonical performance budgets are shared by bundle, API, PostGIS, Outbox, reconnect, and optional Lighthouse checks. Security gates cover request policy, dependency exceptions, secret scanning, private data redaction, and safe logs.
- Request/Socket/Outbox observability, dependency counters, Sentry tags, health/readiness/version, and graceful shutdown are tested without logging actor IDs, message bodies, credentials, or precise coordinates.
- PWA/Capacitor checks cover manifest/icons, a private-API-safe offline shell, non-sensitive draft recovery, permission denial, auth expiry, secure storage, custom/verified links, V2 `webDir`, and Android sync.
- Operational procedures are recorded in [deploy.md](../operations/deploy.md), [rollback.md](../operations/rollback.md), [backup-restore.md](../operations/backup-restore.md), and [incident-response.md](../operations/incident-response.md).

## Fresh verification

| Check | Result |
| --- | --- |
| `npm.cmd run verify:v2-foundation` | PASS; architecture 320 modules / 692 dependencies; Vitest 81 files passed, 3 skipped; 313 tests passed, 7 skipped; workspace build passed |
| `npx.cmd playwright test` | PASS after gate stabilization; 108/108 across all four viewports using 4 workers |
| `npm.cmd run perf:v2` | PASS; `index.js` 193,930 B gzip plus runtime 422 B, below the 200,000 B non-map budget; six API classes reported zero errors; Outbox lag 2,000 ms with 2 attempts; reconnect 0.0 ms |
| `npm.cmd run security:v2` | PASS; config and dependency policy |
| `npm.cmd run cap:v2:smoke` | PASS against `apps/web/dist` |
| `npx.cmd cap sync android` | PASS; V2 web assets copied and Android plugins updated in 0.047 s |
| `git diff --check` | PASS before staging the documentation |

The first unconstrained browser run exposed local contention at 16 workers. Failed tests passed unchanged at 4 workers, so the default is now deterministic at 4 local and 2 CI workers. Subsequent full runs exposed and fixed a Socket optimistic/ack assertion race and a real Leaflet attribution WCAG issue; the final complete run passed 108/108.

## Screenshot and viewport evidence

`auth.spec.ts` creates tile-independent Playwright attachments named `map-mobile-360x800`, `map-mobile-390x844`, `map-mobile-430x932`, and `map-desktop-1440x1000`. Dynamic tile pixels and attribution are hidden only for screenshot capture; axe checks run against the real attribution control. Local `test-results` is ephemeral and is removed before handoff. The final candidate run must retain its Playwright report/artifact under the candidate SHA.

## Environment evidence

| Evidence | State |
| --- | --- |
| Isolated candidate environment identifier | Not available in this workspace |
| Postgres backup reference | Not available; no production/candidate database was authorized |
| Isolated restore rehearsal identifier | Not executed |
| Candidate deploy ID and exact remote SHA | Not executed |
| 30/60 minute observation window | Not executed |

No secret values, database URLs, account identifiers, content, or coordinates are recorded.

## Known warnings and release blockers

Non-blocking local warnings:

- Vite reports an uncompressed JavaScript chunk above 500 kB; the canonical non-map gzip budget passes.
- Deliberate offline Playwright contexts produce Vite proxy `ECONNABORTED` lines while the tests pass; no production request error is inferred from those test-server logs.
- Capacitor sync passed without building or launching an Android APK on a device.
- Seven transitive `tar` / `@mapbox/node-pre-gyp` advisories are covered by the structured platform-owner exception and must be reviewed by 2026-08-15.

Release/tag blockers:

- `DATABASE_URL` / `V2_DATABASE_URL` was not set. Seven Postgres-gated tests were skipped; migrations, backup/restore, and live PostGIS `EXPLAIN` were not executed. Static SQL and GIST checks are not substitutes.
- `V2_LIGHTHOUSE_REPORT` was not set, so LCP, INP, and CLS were not evaluated from a Lighthouse report.
- No isolated remote candidate, retained screenshot artifact, backup reference, restore rehearsal, deploy smoke, or observation window exists.
- The current `render.yaml`, root `render-build`, and root `start` still belong to V1. V2 same-origin static/API/Socket production wiring is reserved for Phase 8.

## Boundary audit and decision

- Frozen V1 `frontend/` and `backend/` were not modified.
- Phase 8 deletion, Render cutover, production promotion, and data migration were not introduced.
- Domain ownership remains unchanged: Footprints owns footprint facts, Discovery owns read projections, Conversations owns messages, Moderation owns cases/actions/audit, Notifications consumes events, and platform adapters own PWA/Capacitor/observability concerns.

The local hardening implementation and runbooks are complete. Phase 7 is not release-accepted until the release blockers above have evidence at one immutable SHA. Do not create `v2-phase-7-hardening` or begin Phase 8 from this evidence alone.
