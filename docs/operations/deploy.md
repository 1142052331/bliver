# V2 Deployment Runbook

This runbook prepares and observes an isolated V2 release candidate. It does not authorize the Phase 8 cutover. The current `render.yaml`, root `start`, and `render-build` commands still deploy V1; do not point them at production and do not delete V1 during Phase 7.

## Ownership and stop conditions

| Responsibility | Required owner |
| --- | --- |
| Release decision, candidate SHA, observation sign-off | Release owner |
| Database migration and backup/restore evidence | Database owner |
| Redeploy of the previous SHA | Rollback owner, different from the release operator when staffing allows |
| Incident coordination and external communication | Incident commander |

Stop before deployment when the worktree is dirty, the candidate SHA changes, a required gate fails, a backup has not been restored successfully, or candidate resources are not isolated. Stop before production until Phase 8 supplies a same-origin V2 web/API/Socket deployment and replaces the V1 Render commands.

## Freeze and build

Use Node 24.16.0 and npm 11.13.0 from the repository root.

```powershell
$env:RELEASE_SHA = git rev-parse HEAD
git status --short
git show --no-patch --format='%H %cI %s' $env:RELEASE_SHA
npm.cmd ci
npm.cmd run check:node
npm.cmd run verify:v2-foundation
npx.cmd playwright test
npm.cmd run perf:v2
npm.cmd run security:v2
npm.cmd run cap:v2:smoke
npx.cmd cap sync android
git diff --check
```

Pass only when every command exits zero and the SHA remains unchanged. A missing live PostGIS `EXPLAIN`, Lighthouse report, or Android SDK must be recorded; a skip is not evidence that the unavailable integration passed.

## Candidate isolation

Create candidate resources without copying production values. Record identifiers, never values.

| Resource | Candidate requirement |
| --- | --- |
| Git | Exact immutable `RELEASE_SHA`; auto-deploy disabled |
| Runtime | `NODE_ENV=production`, `DEPLOY_ENV=staging`, `RELEASE_SHA`, Node 24 |
| PostgreSQL | Postgres 16 with PostGIS; candidate-only database and role |
| Session | Candidate-only `SESSION_SECRET`, at least 32 characters |
| Cloudinary | Candidate-only account/key scope, or intentionally disabled; V2 has no folder override |
| Push | Candidate-only VAPID key pair and subject, or intentionally disabled |
| Web/API | One public origin; `/api` and `/socket.io` route to V2 API |

The V2 API currently starts from TypeScript with `npx tsx apps/api/src/bootstrap/server.ts`; `build:v2` type-checks it but does not emit a production server bundle. The candidate gateway must serve `apps/web/dist` and proxy API and Socket traffic on the same origin. Phase 8 must make this deployment topology repository-owned before production promotion.

## Backup and migrate

For production, complete [backup-restore.md](./backup-restore.md) before migration. For an isolated empty candidate, set `DATABASE_URL` without printing it and run:

```powershell
npm.cmd run db:v2:migrate
```

The migration runner is forward-only and applies `apps/api/drizzle/0000` through `0009`. Stop on any migration error. Do not edit migration history, run ad hoc DDL, or continue with a partially migrated database.

## Start and smoke

Start the API behind the candidate gateway, then verify the exact release:

```powershell
npx.cmd tsx apps/api/src/bootstrap/server.ts
npm.cmd run smoke:v2 -- --api-url $env:CANDIDATE_URL --expected-release $env:RELEASE_SHA
```

Require 200 JSON responses and request IDs from `/healthz`, `/readyz`, and `/versionz`; `version` must equal `RELEASE_SHA`, and `/readyz` must prove `select 1` against Postgres. Verify Socket.IO polling returns 200 and then run the four-viewport Playwright suite against the same candidate origin.

## Promotion and observation

Promotion always uses the already accepted SHA. Re-run smoke before the first write and after deployment. Observe for at least 30 minutes, or 60 minutes after a migration or elevated error rate. The release owner records HTTP error rate and latency, readiness, DB pool/slow-query failures, Socket connections/reconnects, Outbox backlog/retries/failures, and Cloudinary/geocoder/Push failures. Any SHA mismatch, readiness loss, privacy failure, sustained 5xx increase, or undrained Outbox backlog triggers [rollback.md](./rollback.md).
