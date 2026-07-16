# Local Development

Use Node.js 24.16.0 and npm 11.13.0 from the repository root. PowerShell users may need `npm.cmd` when script execution policy blocks the `.ps1` shim.

## Install and Database

Create an ignored environment file from `.env.v2.example`. Set `DATABASE_URL` and a `SESSION_SECRET` of at least 32 characters without printing either value.

```powershell
npm.cmd ci
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run db:v2:seed
```

Docker Compose exposes PostGIS on port `54329`. A native or hosted PostgreSQL 16/PostGIS instance may use the same migrate and seed commands. Integration tests prefer `V2_DATABASE_URL`; otherwise they may use Testcontainers. A skipped integration test is not live PostGIS evidence.

## Run

```powershell
npm.cmd run dev
```

The API defaults to `5100` and Web to `5173`. The Web proxy keeps `/api/v1` and `/socket.io` same-origin from the browser's perspective.

For an emitted production-mode process, build with an exact current SHA and then start:

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
npm.cmd run render-build
npm.cmd start
```

Production mode also requires a reachable `DATABASE_URL` and valid `SESSION_SECRET`.

## Verify

```powershell
npm.cmd run check:node
npm.cmd run verify:v2-foundation
npx.cmd playwright test
npm.cmd run cutover:v2:check
npm.cmd run smoke:v2 -- --api-url http://localhost:5100 --expected-release $env:RELEASE_SHA
```

The smoke command checks `/healthz`, `/readyz`, `/versionz`, `/api/v1`, and Socket polling without printing response bodies or environment values.
