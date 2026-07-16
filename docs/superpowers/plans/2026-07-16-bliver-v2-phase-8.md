# Bliver V2 Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This chapter is intentionally owned by one implementation agent and must not be split across agents.

**Goal:** Replace every V1 runtime and release path with the immutable, same-origin V2 PostGIS release candidate while preserving honest local and external evidence.

**Architecture:** The root workspace becomes the only build and dependency graph. `apps/api` owns the production HTTP/Socket process and serves `apps/web/dist` after API, Socket.IO, and health routes; `scripts/release` owns deterministic release evidence and deletion boundary checks. Phase 7 evidence remains historical, while Phase 8 records all skipped external work as blocked rather than inferred.

**Tech Stack:** Node.js 24, npm 11 workspaces, TypeScript, React/Vite, Express 5, Socket.IO 4, PostgreSQL/PostGIS, Drizzle, Vitest, Playwright, Lighthouse, Capacitor, Render Blueprint.

---

### Task 1: Freeze the V2 candidate

**Files:**
- Create: `scripts/release/manifest.ts`
- Create: `scripts/release/freeze.ts`
- Create: `scripts/release/manifest.test.ts`
- Create: `artifacts/release/v2-candidate-manifest.json`
- Create: `artifacts/release/phase-7-freeze.json`
- Modify: `package.json`

- [ ] Write tests requiring a deterministic manifest with the exact Git SHA, Node/npm versions, root lock SHA-256, ordered migration-content SHA-256, and ordered web asset-list SHA-256.
- [ ] Run `npx vitest run scripts/release/manifest.test.ts` and confirm failure because the module is absent.
- [ ] Implement the manifest interface/generator and Phase 7 gate snapshot comparison without accepting mismatched test counts or OpenAPI hashes.
- [ ] Run the manifest tests, generate OpenAPI, run the frozen Phase 7 gates twice, and record both real snapshots.
- [ ] Commit with `release: freeze V2 candidate`.

### Task 2: Inventory V1 before deletion

**Files:**
- Create: `scripts/release/legacy-boundary.ts`
- Create: `scripts/release/legacy-boundary.test.ts`
- Create: `docs/qa/v2-phase-8-cutover.md`
- Modify: `package.json`

- [ ] Write fixture tests that reject imports, package dependencies, paths, routes, Socket events, env names, assets, or compatibility bridges from V2 runtime into V1.
- [ ] Confirm the fixture test fails before the checker exists.
- [ ] Implement a structured inventory/checker and capture all `frontend/`, `backend/`, root script, Android, Render, documentation, dependency, environment, asset, route, and event findings.
- [ ] Run the boundary assertion against the live tree; resolve any V2-to-V1 dependency before proceeding.
- [ ] Commit with `qa: freeze V1 deletion inventory`.

### Task 3: Switch deployment and mobile to V2

**Files:**
- Modify: `apps/api/src/bootstrap/config.ts`
- Modify: `apps/api/src/bootstrap/server.ts`
- Modify: `apps/api/src/http/app.ts`
- Create: `apps/api/src/http/static-web.ts`
- Create: `apps/api/src/http/__tests__/static-web.test.ts`
- Modify: `package.json`
- Modify: `render.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `capacitor.config.json`
- Modify: `.env.v2.example`

- [ ] Write API tests proving production serves `apps/web/dist`, SPA routes fall back to `index.html`, missing assets remain 404, and `/api`, `/socket.io`, health routes are never intercepted.
- [ ] Write static config tests requiring root-lock caching, V2 required gates, migration-before-start release commands, exact `RELEASE_SHA`, and V2 env names.
- [ ] Confirm both suites fail for the missing production cutover.
- [ ] Implement the production server/static boundary, root release scripts, Render Blueprint, CI release job, and Capacitor V2 shell settings.
- [ ] Verify focused tests, typecheck, build, smoke, and `versionz` exact SHA handling before any database-write command.
- [ ] Commit with `build: switch deployment to V2`.

### Task 4: Delete V1 runtime

**Files:**
- Delete: `frontend/`
- Delete: `backend/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: root scripts/configuration containing V1 compatibility
- Modify: `scripts/release/legacy-boundary.ts`

- [ ] Extend tests so the live-tree checker requires V1 runtime paths, Mongo/JWT dependencies, legacy bridge symbols, and stale env variables to be absent.
- [ ] Confirm the checker fails while V1 directories still exist.
- [ ] Resolve and validate each deletion target under the Phase 8 worktree, then remove with native PowerShell only.
- [ ] Regenerate the root lock with Node 24/npm 11 and run the checker plus the prescribed `rg` assertions.
- [ ] Commit with `refactor: remove V1 runtime and MongoDB`.

### Task 5: Make V2 documentation canonical

**Files:**
- Rewrite: `README.md`
- Rewrite: `AGENTS.md`
- Rewrite: `CLAUDE.md`
- Modify: `docs/operations/deploy.md`
- Modify: `docs/operations/rollback.md`
- Modify: `docs/operations/backup-restore.md`
- Modify: `docs/release/eight-phase-release-runbook.md`
- Move/delete: stale V1 design and release documents

- [ ] Replace documentation tests with canonical V2 assertions for workspace paths, PostGIS, commands, routes, module boundaries, testing, rollback, and backup/restore.
- [ ] Confirm the tests fail while canonical files still describe V1.
- [ ] Rewrite canonical docs and move retained historical V1 material under an explicit archive path without altering Phase 7 facts.
- [ ] Run documentation and legacy-contract scans.
- [ ] Commit with `docs: make V2 documentation canonical`.

### Task 6: Verify from a clean environment

**Files:**
- Create/update: `artifacts/release/phase-8-clean-verification.json`
- Modify: `docs/qa/v2-phase-8-cutover.md`

- [ ] Create a temporary checkout whose resolved absolute path is under the worktree parent and contains no `node_modules`, `.env`, V1 runtime, or stale generated output.
- [ ] Run `npm ci`, start Docker PostGIS, migrate, seed, build/start, and probe health/readiness/version/API/Socket/PWA/Android.
- [ ] Run `check:node`, V2 verification, full Playwright, isolated browser evidence, Lighthouse/performance, security, Capacitor smoke, secret scan, `git diff --check`, and legacy assertions.
- [ ] Record exact commands, exit codes, counts, metrics, and honest skips; validate the temporary path before native PowerShell cleanup.
- [ ] Commit with `qa: verify clean V2 release`.

### Task 7: Record the publish baseline and exit gate

**Files:**
- Create/update: `artifacts/release/v2-baseline.json`
- Modify: `docs/qa/v2-phase-8-cutover.md`
- Modify: `docs/release/eight-phase-release-runbook.md`

- [ ] Generate the final immutable manifest and record final SHA lineage, checksums, counts, metrics, and environment-variable names.
- [ ] Mark Render deployment, remote `/versionz`, observation window, and `v2.0.0` tag as `BLOCKED` when credentials/evidence are absent; never create the tag locally.
- [ ] Re-run the complete exit gate in a clean checkout, including empty PostGIS migration/seed/start/report-SHA and no-V1 assertions.
- [ ] Run final `git diff --check`, confirm worktree cleanliness after commit, and commit with `release: publish V2 baseline evidence` only when wording says release-ready/blocked rather than published.
