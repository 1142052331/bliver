# V2 Deployment Runbook

Render deploys one immutable, same-origin API/Web/Socket service from the root npm workspace. Auto-deploy is disabled in `render.yaml`. A release owner must select and record the exact SHA.

## Stop Conditions

Stop when the checkout is dirty, `RELEASE_SHA` is not a 40-character SHA, `RENDER_GIT_COMMIT` differs, a required gate fails, database backup restore has not been proven, migration status is unknown, database parity has not been compared with the approved baseline, the production map provider is not audited and same-origin, or candidate resources are not isolated. Never turn a skipped live integration into a pass.

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

## Map Provider Gate

`VITE_MAP_STYLE_URL` and `VITE_MAP_ATTRIBUTION_JSON` are Vite build-time configuration. Set both in Render before `render-build`; changing them on a running service does not change the compiled Web bundle and requires a rebuild and redeploy. The repository-root `.env.v2*` files are the local source for Vite mode `v2` only and must not contain real production values.

Normal production releases must use an audited root-relative same-origin style URL. Review the style document and every sprite, glyph, tile, attribution, caching, privacy, availability, and terms dependency; nested external origins are not accepted by the production CSP. Encode every legally required credit in `VITE_MAP_ATTRIBUTION_JSON` as an array of plain `{ "label", "href" }` objects; missing or unsafe attribution fails closed to the static map path.

`https://tiles.openfreemap.org` is the local-development fallback, not a routine production provider. An emergency release requires `MAP_PROVIDER_EMERGENCY=1` and `MAP_PROVIDER_EMERGENCY_EXPIRES_AT` set to a future ISO timestamp no more than seven days away. `render-build` runs `release:v2:verify-map-provider` before compiling the client, so a blank provider or expired exception stops the build.

Reject the release if an unapproved provider origin is accepted. Verify that rejected configuration, WebGL initialization failure, and provider/style errors expose the static geographic fallback while preserving the actionable semantic footprint list; provider failure must not become footprint API failure.

## Render Order

Render executes the repository-owned commands in this order:

1. `npm ci --include=dev --no-audit --no-fund && npm run render-build`
2. `npm run release:v2:predeploy`
3. `npm start`
4. readiness probe at `/readyz`

`release:v2:predeploy` verifies the candidate again before `db:v2:migrate`; no database write is allowed before this check. Production variables are `DATABASE_URL`, `SESSION_SECRET`, exact `RELEASE_SHA`, Cloudinary credentials, VAPID keys/subject, `SENTRY_DSN`, build-time `VITE_MAP_STYLE_URL` and `VITE_MAP_ATTRIBUTION_JSON`, `NODE_ENV`, `DEPLOY_ENV`, and `PORT`. Emergency provider variables must normally be blank.

## Smoke and Observation

Against the one public HTTPS origin, require:

- `/healthz`, `/readyz`, and `/versionz` return JSON with request IDs and no-store caching.
- `/versionz.version` equals the deployed SHA exactly.
- `/api/v1` guest and authenticated probes enforce expected authorization.
- `/socket.io/?EIO=4&transport=polling` opens successfully.
- `/` and a deep link return the PWA shell; a missing hashed asset returns 404.

Observe HTTP error/latency, readiness, pool/slow-query failures, Socket reconnects, Outbox backlog/retries/dead letters, and provider failures for at least 30 minutes, or 60 minutes after migration. Record aggregate metrics and identifiers only. Any SHA mismatch, privacy failure, readiness loss, sustained regression, or undrained Outbox triggers [rollback.md](./rollback.md).
