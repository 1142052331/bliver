# V2 Phase 7 QA: Product Hardening

Date: 2026-07-16
Baseline: `7497177` (accepted Phase 6 implementation evidence)
Implementation and hardening commits: `666d7a1`, `9732099`, `713cc6d`, `519477e`, `ee8ac80`, `5bb8602`, `c6a0d9d`, `7c5a33a`, `c5e64a4`, `25559e9`, `bdc24ab`, `8749298`, `f6fac92`, `4d326b6`, `2476331`, `f48a968`, `5a5c1cd`, `5c60568`, `63a7882`, `797d4b2`, `1b68419`
Status: `DONE_WITH_CONCERNS`; release acceptance and tag are pending external evidence.

## Scope verified

- Deterministic guest, admin, user A, and user B fixtures cover public/friends/private and precise/approximate footprints. Route journeys, pending guest actions, governance, two-person messaging, block/revoke, real Socket reconnect, offline map fallback, and deep-link auth return run at 360x800, 390x844, 430x932, and 1440x1000. Message delivery crosses the real Outbox repository claim/worker/consumer path; each viewport proves the delay window, one retry with `attempts=2`, and eventual Socket delivery.
- Axe, keyboard focus/order, Escape/focus restoration, form errors, 44px controls, safe areas, long content, overflow, and reduced motion are browser gates. Leaflet attribution is visibly underlined rather than excluded from axe.
- The canonical performance budgets are shared by bundle, API, PostGIS, Outbox, reconnect, browser Event Timing, and Lighthouse checks. Release mode requires live PostGIS, browser, and Lighthouse evidence instead of accepting static substitutes. Security gates cover request policy, dependency exceptions, secret scanning, private data redaction, and safe logs. Dependency exceptions reject invalid or expired UTC review dates while remaining valid through the stated review day.
- Request/Socket/Outbox observability, dependency counters, Sentry tags, health/readiness/version, and graceful shutdown are tested without logging actor IDs, message bodies, credentials, or precise coordinates.
- PWA/Capacitor checks cover manifest/icons, a private-API-safe offline shell, non-sensitive draft recovery, permission denial, auth expiry, secure storage, custom/verified links, V2 `webDir`, and Android sync. The root smoke runs the platform behavior suite, a real mobile Playwright login-return journey, and `cap sync android`; its browser output is isolated so it cannot erase full-suite performance evidence. Playwright web servers and the nested Capacitor gates share a Node CLI launcher that is regression-tested with Windows and Linux command environments.
- Operational procedures are recorded in [deploy.md](../operations/deploy.md), [rollback.md](../operations/rollback.md), [backup-restore.md](../operations/backup-restore.md), and [incident-response.md](../operations/incident-response.md).
- The V2 CI job installs Chromium with system dependencies, runs the complete Playwright suite through platform-neutral Node CLI commands, and finishes with `git diff --check`. The existing V1 backend, frontend, and release dependency graph remains independent of the V2 job.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm.cmd run verify:v2-foundation` | PASS; architecture 744 modules / 707 dependencies; Vitest 82 files passed, 3 skipped; 328 tests passed, 7 skipped; workspace build passed |
| `npx.cmd playwright test` | PASS; 120/120 across all four viewports using 4 workers; every viewport claimed and retried a real `MessageSent` Outbox event before Socket delivery |
| `npm.cmd run lighthouse:v2` | PASS; mobile `throttlingMethod=provided`; LCP 267.256 ms and CLS 0 |
| `$env:V2_LIGHTHOUSE_REPORT='.artifacts/lighthouse-v2.json'; npm.cmd run perf:v2` | PASS in local non-release mode; `index.js` 193,977 B gzip plus runtime 422 B; six API classes reported zero errors; Outbox lag 2,000 ms with 2 attempts; reconnect 52.1 ms; INP 64 ms; live PostGIS explicitly skipped |
| `$env:V2_PERF_MODE='release'; $env:V2_LIGHTHOUSE_REPORT='.artifacts/lighthouse-v2.json'; npm.cmd run perf:v2` | EXPECTED BLOCK; browser and Lighthouse evidence passed, but live PostGIS `EXPLAIN` was missing |
| `npm.cmd run security:v2` | PASS; config, 7 runtime behavior suites, and dependency policy |
| `npm.cmd run cap:v2:smoke` | PASS; platform behavior 6/6, real mobile deep-link auth return 1/1, and Android sync; full-suite browser evidence remained present afterward |
| `npx.cmd cap sync android` | PASS; V2 web assets copied and Android plugins updated |
| `git diff --check` | PASS |

The first unconstrained browser run exposed local contention at 16 workers. Failed tests passed unchanged at 4 workers, so the default is now deterministic at 4 local and 2 CI workers. Subsequent full runs exposed and fixed a Socket optimistic/ack assertion race, a handler-level delay that bypassed Outbox claim/processing, a real Leaflet attribution WCAG issue, missing real browser/performance gates, Windows-only Playwright commands, and a Capacitor smoke output collision. The final complete run passed 120/120, and the eight INP/reconnect evidence files remained present after the Capacitor browser smoke.

## Screenshot and viewport evidence

`auth.spec.ts` creates Playwright attachments named `map-mobile-360x800`, `map-mobile-390x844`, `map-mobile-430x932`, and `map-desktop-1440x1000`. OpenStreetMap tile requests receive a controlled 1x1 PNG during tests, while the real Leaflet attribution control stays rendered and participates in axe checks. Local `test-results` is ephemeral and is removed before handoff. The final candidate run must retain its Playwright report/artifact under the candidate SHA.

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
- Deliberate offline and Socket disconnect Playwright contexts produce Vite proxy `ECONNABORTED` lines while the tests pass; no production request error is inferred from those test-server logs.
- Capacitor sync passed without building or launching an Android APK on a device.
- Seven transitive `tar` / `@mapbox/node-pre-gyp` advisories are covered by the structured platform-owner exception and must be reviewed by 2026-08-15.

Release/tag blockers:

- `DATABASE_URL` / `V2_DATABASE_URL` was not set. Seven Postgres-gated tests were skipped; migrations, backup/restore, and live PostGIS `EXPLAIN` were not executed. Static SQL and GIST checks are not substitutes.
- Local Lighthouse and browser Event Timing evidence is ephemeral and was captured against local test servers, not an isolated candidate deployment; it is not a retained candidate-SHA artifact.
- No isolated remote candidate, retained screenshot artifact, backup reference, restore rehearsal, deploy smoke, or observation window exists.
- The current `render.yaml`, root `render-build`, and root `start` still belong to V1. V2 same-origin static/API/Socket production wiring is reserved for Phase 8.

## Boundary audit and decision

- Frozen V1 `frontend/` and `backend/` were not modified.
- Phase 8 deletion, Render cutover, production promotion, and data migration were not introduced.
- Domain ownership remains unchanged: Footprints owns footprint facts, Discovery owns read projections, Conversations owns messages, Moderation owns cases/actions/audit, Notifications consumes events, and platform adapters own PWA/Capacitor/observability concerns.

The local hardening implementation and runbooks are complete. Phase 7 is not release-accepted until the release blockers above have evidence at one immutable SHA. Do not create `v2-phase-7-hardening` or begin Phase 8 from this evidence alone.
