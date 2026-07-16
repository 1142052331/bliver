# V2 Deployment Runbook

Render deploys one immutable, same-origin API/Web/Socket service from the root npm workspace. Auto-deploy is disabled in `render.yaml`. A release owner must select and record the exact SHA.

## Stop Conditions

Stop when the checkout is dirty, `RELEASE_SHA` is not a 40-character SHA, `RENDER_GIT_COMMIT` differs, a required gate fails, database backup restore has not been proven, migration status is unknown, database parity has not been compared with the approved baseline, or candidate resources are not isolated. Never turn a skipped live integration into a pass.

## Local Candidate Gate

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
$env:RENDER_GIT_COMMIT = $env:RELEASE_SHA
npm.cmd ci
npm.cmd run verify:v2-foundation
npx.cmd playwright test
npm.cmd run perf:v2:browser-evidence
npm.cmd run lighthouse:v2
$env:V2_PERF_MODE = 'release'
npm.cmd run perf:v2
npm.cmd run security:v2
npm.cmd run cap:v2:smoke
npm.cmd run cutover:v2:check
npm.cmd run db:v2:parity -- --compare artifacts/release/database-parity-baseline.json --require-production-equivalent
npm.cmd run render-build
git diff --check
```

`render-build` verifies SHA identity before compilation, emits `apps/api/dist/bootstrap/server.js`, builds `apps/web/dist`, and rechecks both artifacts. It does not write the database.

## Render Order

Render executes the repository-owned commands in this order:

1. `npm ci --include=dev --no-audit --no-fund && npm run render-build`
2. `npm run release:v2:predeploy`
3. `npm start`
4. readiness probe at `/readyz`

`release:v2:predeploy` verifies the candidate again before `db:v2:migrate`; no database write is allowed before this check. Production variables are `DATABASE_URL`, `SESSION_SECRET`, exact `RELEASE_SHA`, Cloudinary credentials, VAPID keys/subject, `SENTRY_DSN`, `NODE_ENV`, `DEPLOY_ENV`, and `PORT`.

## Smoke and Observation

Against the one public HTTPS origin, require:

- `/healthz`, `/readyz`, and `/versionz` return JSON with request IDs and no-store caching.
- `/versionz.version` equals the deployed SHA exactly.
- `/api/v1` guest and authenticated probes enforce expected authorization.
- `/socket.io/?EIO=4&transport=polling` opens successfully.
- `/` and a deep link return the PWA shell; a missing hashed asset returns 404.

Observe HTTP error/latency, readiness, pool/slow-query failures, Socket reconnects, Outbox backlog/retries/dead letters, and provider failures for at least 30 minutes, or 60 minutes after migration. Record aggregate metrics and identifiers only. Any SHA mismatch, privacy failure, readiness loss, sustained regression, or undrained Outbox triggers [rollback.md](./rollback.md).
