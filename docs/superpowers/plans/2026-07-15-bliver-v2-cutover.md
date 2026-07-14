# Bliver V2 Phase 8 Cutover and V1 Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make V2 the only runnable Bliver system, remove V1 and MongoDB artifacts, update Render/Capacitor/docs, and prove a clean empty-environment release.

**Architecture:** This is the only phase authorized to delete `frontend/`, `backend/`, old package locks, V1 scripts, V1 routes, legacy events and MongoDB configuration. Cutover happens only after Phase 7 evidence is complete and a clean V2 release candidate is frozen.

**Tech Stack:** npm workspaces, Render, PostgreSQL/PostGIS, Capacitor, release smoke scripts, Git SHA verification.

---

## Files and ownership

- Modify: `package.json`, `package-lock.json`, `.gitignore`, `render.yaml`, `capacitor.config.json`, and the existing `android/` Capacitor project for V2 webDir/deep-link settings.
- Delete after inventory: `frontend/`, `backend/`, old root scripts and old package locks. Preserve the Android project itself; remove only generated V1 web assets and regenerate it from the V2 build.
- Create/modify: `scripts/release-v2.ts`, `scripts/__tests__/release-v2.test.ts`.
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml` if present.
- Rewrite canonical docs: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture/*`, `docs/qa/*`.
- Create evidence: `docs/qa/v2-phase-8-cutover.md`.

## Canonical release records

```ts
export interface ReleaseManifest {
  releaseSha: string;
  nodeVersion: string;
  npmVersion: string;
  lockfileSha256: string;
  migrationSha256: string;
  assetListSha256: string;
}

export interface V1Inventory {
  paths: readonly string[];
  apiRoutes: readonly string[];
  socketEvents: readonly string[];
  environmentKeys: readonly string[];
  packages: readonly string[];
}
```

Release records contain names and checksums only; they never contain secret values or response bodies.

## Task 1: Freeze the V2 release candidate

- [ ] Create a release branch from the Phase 7 tag and record the exact SHA.
- [ ] Run all Phase 7 gates twice from a clean checkout; compare test/build counts and generated OpenAPI checksum.
- [ ] Freeze feature changes; only release-blocking fixes are allowed after this task.
- [ ] Create a signed candidate manifest containing Node/npm versions, workspace lockfile checksum, migration list and build asset list.
- [ ] Commit `release: freeze V2 candidate`.

## Task 2: Inventory every V1 entry before deletion

- [ ] Run a final dependency graph over `frontend/`, `backend/`, root scripts, Android config, Render config and documentation.
- [ ] Record every V1 route, Socket event, environment variable, package, migration script and public asset in `docs/qa/v2-phase-8-cutover.md`.
- [ ] Assert that no V2 import, generated client or deployment command references the inventory.
- [ ] Abort the task if any V2 source imports a V1 path or if any V1 process is required to boot V2.
- [ ] Commit `qa: freeze V1 deletion inventory`.

## Task 3: Replace deployment and mobile configuration

- [ ] Update `render.yaml` to build the root workspace, run V2 migrations in the release procedure, start `apps/api`, and health-check `/readyz`.
- [ ] Replace `MONGODB_URI` and `JWT_SECRET` with `DATABASE_URL`, `SESSION_SECRET`, `RELEASE_SHA`, Cloudinary, VAPID and Sentry names.
- [ ] Update `capacitor.config.json` to use `apps/web/dist`, production HTTPS origin and the V2 app shell.
- [ ] Update CI cache paths to the root lockfile and make V2 gates the required status checks.
- [ ] Test candidate build and `versionz` SHA before any database write.
- [ ] Commit `build: switch deployment to V2`.

## Task 4: Remove V1 runtime and dependencies

- [ ] Delete `frontend/`, `backend/`, `frontend/package-lock.json`, `backend/package-lock.json`, old MongoDB models/config, old JWT middleware, old routes, old Socket handlers, old backfill scripts and V1-only Android/web assets.
- [ ] Remove V1 root scripts and dependencies that are not referenced by `apps/*` or `packages/*`.
- [ ] Remove legacy `CustomEvent` bridges, old feature flags, compatibility imports and stale environment names.
- [ ] Run `rg` for `mongoose`, `MONGODB_URI`, old `/api` paths without `/v1`, `JWT_SECRET`, `ProfileDrawer`, `ClusterDetailPanel`, `LegacyDestinationBridge`, and old Socket event names; every result must be either historical documentation explicitly marked as removed or zero results.
- [ ] Commit `refactor: remove V1 runtime and MongoDB`.

## Task 5: Rewrite canonical documentation and examples

- [ ] Rewrite README setup, workspace tree, V2 commands, Postgres/PostGIS prerequisites, Cloudinary configuration and Capacitor workflow.
- [ ] Rewrite `AGENTS.md` and `CLAUDE.md` to match actual directories, route conventions, dependency rules and testing commands.
- [ ] Remove stale design docs that describe V1 behavior; preserve historical records only under an explicitly archived path.
- [ ] Update release and QA runbooks with V2 SHA, readiness, backup/restore and rollback procedures.
- [ ] Commit `docs: make V2 documentation canonical`.

## Task 6: Run clean-environment release validation

- [ ] Clone/checkout the frozen SHA into a clean directory with no `node_modules`, no `.env`, no V1 folders and no generated artifacts.
- [ ] Run `npm ci`, create Postgres, run all migrations, seed deterministic fixtures, build Web and start API.
- [ ] Run `npm run verify:v2-foundation`, full Playwright, performance, security and Capacitor smoke suites.
- [ ] Verify `/healthz`, `/readyz`, `/versionz`, `/api/v1`, Socket polling/connection, PWA assets and Android webDir.
- [ ] Verify no private data appears in logs, generated OpenAPI, browser bundles or public assets.
- [ ] Commit `qa: verify clean V2 release`.

## Task 7: Tag and publish the V2 baseline

- [ ] Record final SHA, migration checksum, asset checksum, test counts, performance metrics and environment key names only.
- [ ] Create tag `v2.0.0` only after all acceptance records are committed.
- [ ] Publish the candidate through the documented Render workflow and verify the deployed SHA through `/versionz`.
- [ ] Start the post-launch observation runbook; any P0/P1 or privacy issue blocks further feature work.
- [ ] Commit `release: publish V2 baseline evidence`.

## Phase 8 exit gate

Run:

```text
npm.cmd run check:node
npm.cmd ci
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run verify:v2-foundation
npx playwright test
npm.cmd run perf:v2
npm.cmd run security:v2
npm.cmd run cap:v2:smoke
git diff --check
```

The phase passes only when the clean checkout contains no V1 runtime path, no MongoDB dependency, no legacy API/Socket contract, and can build, migrate, start, test, and report its exact release SHA from an empty environment.
