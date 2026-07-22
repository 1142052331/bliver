# Bliver

Bliver is a mobile-first location social network built around a living map. People publish footprints with explicit audience and location precision, discover recent public moments, interact with friends, and keep a private geographic memory.

## Runtime

- Node.js 24.16.0 and npm 11.13.0
- npm workspaces with strict TypeScript
- React 19, Vite 8, MapLibre GL, GSAP, and Socket.IO Client in `apps/web`
- Express 5 and Socket.IO in `apps/api`
- PostgreSQL 16 with PostGIS, Drizzle migrations, and session/cookie authentication
- Capacitor 8 Android shell using `apps/web/dist`
- One production origin for the Web shell, `/api/v1`, `/socket.io`, and health endpoints

## Workspace

```text
apps/
  api/                  Express modular monolith, PostGIS repositories, migrations
  web/                  React route shell, feature slices, PWA assets
packages/
  config/               shared lint and test configuration
  contracts/            Zod DTOs, events, Problem Details, OpenAPI
  domain/               platform-independent values and policies
  testing/              cross-workspace test utilities
  ui/                   Natural City tokens and primitives
scripts/                release, security, performance, Capacitor, smoke tools
infra/                  local PostGIS Docker Compose
android/                Capacitor Android project
```

`apps/web` may import public contracts, domain policies, and UI primitives, never API internals. API modules communicate through application ports rather than another module's infrastructure. `packages/domain` has no HTTP, database, DOM, or environment ownership. `npm run architecture:check` enforces these boundaries.

## Local Development

Copy `.env.v2.example` to an ignored local environment file and supply at least `DATABASE_URL` and a 32-character `SESSION_SECRET`.

```powershell
npm.cmd ci
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run db:v2:seed
npm.cmd run dev
```

The Web dev server is `http://localhost:5173`; the API is `http://localhost:5100`. Vite proxies `/api` and `/socket.io`, preserving the production same-origin contract.

## Environment

Production names are `NODE_ENV`, `DEPLOY_ENV`, `RELEASE_SHA`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_DSN`, `VITE_MAP_STYLE_URL`, and `VITE_MAP_ATTRIBUTION_JSON`. `MAP_PROVIDER_EMERGENCY` and `MAP_PROVIDER_EMERGENCY_EXPIRES_AT` exist only for an approved provider outage. Do not commit values. Production requires `RELEASE_SHA` to be the exact 40-character Git SHA.

`VITE_MAP_STYLE_URL` and structured `VITE_MAP_ATTRIBUTION_JSON` are compiled into the Web bundle during the Vite build. The browser accepts a relative URL, an absolute URL on the deployed page origin, or `https://tiles.openfreemap.org`; every other origin is rejected. The release gate is stricter: a normal production candidate must use an audited root-relative style URL and provide every legally required attribution as JSON `{ "label", "href" }` entries. OpenFreeMap is the keyless local-development fallback and may be released only with `MAP_PROVIDER_EMERGENCY=1` plus an ISO expiry no more than seven days away. If provider validation or MapLibre initialization fails, the map retains its static geographic summary and actionable semantic footprint list.

## API and Health

Application HTTP routes are versioned under `/api/v1`. Socket.IO uses `/socket.io`. The public operational endpoints are:

- `/healthz`: process health and release metadata
- `/readyz`: database-backed readiness
- `/versionz`: exact release SHA and deployment environment

The production API process serves `apps/web/dist` after API and health routing. Route-like GET requests receive the SPA shell; missing assets and reserved namespaces remain 404.

OpenAPI is generated with:

```powershell
npm.cmd run contracts:openapi --workspace @bliver/contracts
```

## Verification

```powershell
npm.cmd run check:node
npm.cmd run verify:v2-foundation
npx.cmd playwright test
npm.cmd run perf:v2:browser-evidence
npm.cmd run lighthouse:v2
npm.cmd run perf:v2
npm.cmd run security:v2
npm.cmd run cap:v2:smoke
npm.cmd run cutover:v2:check
git diff --check
```

Database integration tests require PostGIS and may be reported as skipped when neither `V2_DATABASE_URL` nor Docker is available. A skip is not live database evidence.

## Release

`npm run render-build` verifies release identity, builds every V2 workspace, and verifies the API/Web artifacts. `npm run release:v2:predeploy` rechecks the candidate before applying migrations. `npm start` runs the emitted API, which serves the Web shell on the same origin.

Operational procedures:

- [Deployment](docs/operations/deploy.md)
- [Backup and restore](docs/operations/backup-restore.md)
- [Rollback](docs/operations/rollback.md)
- [Release runbook](docs/release/eight-phase-release-runbook.md)
- [Phase 8 evidence](docs/qa/v2-phase-8-cutover.md)

Historical specifications and QA evidence live under `docs/archive/` and are not current operating instructions.
