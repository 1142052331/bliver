# Bliver V2 Phase 7 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove V2 across real user journeys, mobile/desktop viewports, security, accessibility, performance, observability, PWA and Capacitor behavior before cutover.

**Architecture:** This phase changes no domain ownership. It adds evidence, budgets, failure drills, browser coverage, release automation and operational runbooks around the completed V2 modules.

**Tech Stack:** Playwright, Vitest, Testcontainers, Lighthouse CI, axe-core, autocannon, Sentry, OpenTelemetry-compatible structured logs, Capacitor CLI.

---

## Files and ownership

- Create E2E suites: `apps/web/e2e/{auth,map-footprints,discovery-interaction,social-messaging,memories-governance}.spec.ts`.
- Create fixtures: `packages/testing/src/{users,footprints,social,server}.ts`.
- Create performance checks: `scripts/perf/{run.ts,api-smoke.ts,map-query.ts,outbox-lag.ts}`.
- Create security checks: `scripts/security/{run.ts,config-audit.ts,dependency-policy.ts}`.
- Create Capacitor smoke: `scripts/capacitor/smoke.ts`.
- Create: `playwright.config.ts`.
- Modify: `.github/workflows/ci.yml`, `package.json`, `apps/web/vite.config.ts`, `apps/api/src/platform/observability`, `capacitor.config.json`.
- Create docs: `docs/operations/{deploy,rollback,backup-restore,incident-response}.md`, `docs/qa/v2-phase-7-hardening.md`.

## Canonical budgets

```ts
export const V2_BUDGETS = {
  initialNonMapJsGzipBytes: 200_000,
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1,
  mapApiP95Ms: 400,
  commandApiP95Ms: 300,
  maxOutboxLagMs: 5_000,
} as const;
```

Performance scripts import this object; no check keeps a second numeric budget.

## Task 1: Complete browser journey coverage

- [ ] Create deterministic seed fixtures for guest, admin, user A and user B with public/friends/private and precise/approximate footprints.
- [ ] Add Playwright tests for every route and the complete main loop from map discovery to memory.
- [ ] Add dual-browser Socket tests for online/offline, reconnect, message delivery, block, session revoke and Outbox delay.
- [ ] Capture stable screenshots for 360x800, 390x844, 430x932 and 1440x1000; exclude dynamic map tile pixels through a controlled fixture layer.
- [ ] Commit `test: cover V2 browser journeys`.

## Task 2: Accessibility and reduced-motion audit

- [ ] Add axe-core checks to every route-level Playwright suite.
- [ ] Test keyboard order, visible focus, Escape behavior, focus restoration, screen-reader labels, 44px controls, form errors and dialog semantics.
- [ ] Test safe-area padding, dynamic keyboard handling, long names/messages and horizontal overflow at all mobile sizes.
- [ ] Test reduced-motion removes nonessential marker pulses and transition animations without hiding state.
- [ ] Commit `test: enforce V2 accessibility gates`.

## Task 3: Establish performance budgets

- [ ] Add a production build budget that fails when non-map initial JS exceeds 200 KB gzip or route chunks regress by more than 10% without an entry.
- [ ] Add API load checks for map, Activity, publish, comments, conversations and notifications; record p50/p95 and error rate.
- [ ] Add PostGIS `EXPLAIN` fixtures and fail on sequential scans beyond the approved fixture threshold.
- [ ] Add Outbox lag and consumer retry checks; verify reconnect resync duration.
- [ ] Add root script `perf:v2` pointing to `tsx scripts/perf/run.ts`; the runner executes all three checks and exits non-zero when a budget is exceeded.
- [ ] Commit `perf: add V2 performance budgets`.

## Task 4: Harden security and dependency policy

- [ ] Add tests for cookie flags, CSRF, Origin checks, rate limits, CORS/CSP, upload limits, SSRF-safe provider URLs, role revocation and private coordinate redaction.
- [ ] Run `npm audit --audit-level=high` for root and workspaces; add a documented exception only with owner, reason and review date.
- [ ] Add a secret scan that rejects committed real env values and checks `.env.v2.example` contains names only.
- [ ] Add request log assertions that passwords, tokens, message bodies and private coordinates never appear.
- [ ] Add root script `security:v2` pointing to `tsx scripts/security/run.ts`; the runner executes both checks and prints only pass/fail summaries.
- [ ] Commit `security: enforce V2 production policies`.

## Task 5: Complete observability and health contracts

- [ ] Add structured request/Socket/Outbox logs with request ID, correlation ID, method/event, status, duration and safe actor ID hash only.
- [ ] Add metrics for error rate, latency, DB pool, slow queries, Socket connections/reconnects, Outbox backlog/retries, Cloudinary/geocoding/Push failures.
- [ ] Add Sentry release and environment tags without sending message bodies or precise coordinates.
- [ ] Test `/healthz`, `/readyz`, `/versionz`, graceful shutdown and dependency failure responses.
- [ ] Commit `ops: add V2 observability contracts`.

## Task 6: Harden PWA and Capacitor

- [ ] Add manifest, icons, offline shell and cache policy that never caches private API responses or credentials.
- [ ] Test offline map fallback, queued form draft recovery, auth expiry, camera/location permission denial and deep links.
- [ ] Run `npx cap sync android` against `apps/web/dist` and verify app ID, HTTPS-only production URL and secure storage adapter.
- [ ] Add a Capacitor smoke command that opens a deep link to a footprint and returns to the correct route after auth.
- [ ] Add root script `cap:v2:smoke` pointing to `tsx scripts/capacitor/smoke.ts`; fail when `apps/web/dist` is missing or Capacitor `webDir` does not resolve to it.
- [ ] Commit `feat: harden V2 PWA and Capacitor clients`.

## Task 7: Write operational runbooks and release checklist

- [ ] Document build, deploy, rollback, migration, backup restore, Outbox backlog, Socket outage, Cloudinary outage, geocoder outage and Push outage procedures.
- [ ] Define release owner, rollback owner, SHA verification, readiness checks and observation window.
- [ ] Record candidate environment isolation, Postgres backup reference and restore evidence without secrets.
- [ ] Add `docs/qa/v2-phase-7-hardening.md` with commands, screenshots, metrics and known non-blocking warnings.
- [ ] Commit `docs: add V2 hardening and operations evidence`.

## Phase 7 exit gate

Run:

```text
npm.cmd run verify:v2-foundation
npx playwright test
npm.cmd run perf:v2
npm.cmd run security:v2
npm.cmd run cap:v2:smoke
git diff --check
```

The phase passes only when all four viewports, guest/admin/user A/user B, offline/reduced-motion, security, performance and Capacitor checks pass and runbooks contain a tested rollback path. Commit `docs/qa/v2-phase-7-hardening.md` and tag the accepted SHA as `v2-phase-7-hardening`.
