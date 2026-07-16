# Bliver V2 Release Runbook

This runbook promotes one immutable root-workspace V2 candidate. The Web shell, `/api/v1`, `/socket.io`, health endpoints, PostGIS migrations, and release metadata are one release unit.

## 1. Freeze

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
git status --short
npm.cmd run check:node
npm.cmd run release:v2:verify-sha
```

Require a clean checkout and exact 40-character SHA. Record root lock, migration, assets, Node/npm, OpenAPI, and test-count checksums with the release manifest tooling.

The candidate SHA is the commit that was built and verified. A later evidence-only commit does not silently replace it: deploy the recorded candidate exactly, or generate a new manifest and repeat every gate for the newer SHA.

The final production topology is one contract: Render service `bliver`, `NODE_ENV=production`, `DEPLOY_ENV=production`, public/Capacitor origin `https://bliver.onrender.com`, and Android App Link host `bliver.onrender.com`. The deployment regression test parses the Blueprint, calls runtime `createConfig`, and cross-checks the mobile files. Do not deploy a candidate that only validates these files independently.

## 2. Required Local Gates

```powershell
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
npm.cmd run render-build
git diff --check
```

Release performance mode requires live PostGIS and Lighthouse/browser evidence. Record exact pass/skip/failure counts. A skipped database test or absent provider is `BLOCKED`, never a pass.

## 3. Backup and Migration

Complete [backup-restore.md](../operations/backup-restore.md) against a separate restore database. Record only opaque identifiers, checksums, versions, timestamps, aggregate counts, and operator roles.

Render predeploy runs:

```powershell
npm.cmd run release:v2:predeploy
```

This re-verifies API/Web artifacts and release identity before `db:v2:migrate`. Stop on any mismatch or migration error.

## 4. Start and Smoke

Render starts with `npm start` and probes `/readyz`. Against the one HTTPS origin, run the release smoke with `EXPECTED_RELEASE` set to the same SHA. Require root/deep-link HTML, `/healthz`, `/readyz`, `/versionz`, representative `/api/v1` responses, Socket polling, PWA manifest/service worker/icons, and Android `webDir` evidence. `/versionz.version` must equal `RELEASE_SHA` exactly.

Run Capacitor sync before mobile acceptance and require the generated Android Capacitor config plus verified App Link host to match the Blueprint-derived production origin.

## 5. Observe and Roll Back

Observe for 30 minutes, or 60 after migration/elevated errors. Record request errors/latency, readiness, database pool/slow queries, Socket connections/reconnects, Outbox backlog/retries/dead letters, and provider failures. Follow [rollback.md](../operations/rollback.md) for any acceptance trigger.

## 6. Publish Decision

Create `v2.0.0` only when all of the following exist at the same immutable SHA:

- successful real Render deployment;
- remote `/versionz` exact match;
- restored backup evidence and migration result;
- complete local and remote acceptance records;
- remote observation window started with owners and baseline metrics.

Without those facts, record release-ready local evidence and mark publication `BLOCKED`. Do not create the tag, claim deployment, or invent observation results.

The blocked baseline record belongs in `artifacts/release/v2-baseline.json`. It records SHA lineage, checksums, counts, metrics, and environment key names only; it must not contain credentials, response bodies, or an unverified deployment identifier.

Any SHA listed under `supersededCandidates` is `SUPERSEDED_DO_NOT_DEPLOY`, even if an earlier local gate passed. Only `releaseCandidateSha` may advance to external acceptance.

## Environment Names

`DATABASE_URL`, `SESSION_SECRET`, `RELEASE_SHA`, `NODE_ENV`, `DEPLOY_ENV`, `PORT`, Cloudinary credentials, VAPID public/private/subject, and `SENTRY_DSN`. Values never enter Git, logs, QA artifacts, command output, or tickets.
