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

## Database parity

Capture a machine-readable fingerprint from an approved PostgreSQL target. The command reads `V2_DATABASE_URL` first and falls back to `DATABASE_URL`; neither the URL nor row data is written to the output.

```powershell
$env:V2_DATABASE_URL = '<target-url>'
npm.cmd run db:v2:parity -- --write-baseline artifacts/release/database-parity-baseline.json --scope PRODUCTION_EQUIVALENT
```

The fingerprint records PostgreSQL major/minor, `postgis`/`pgcrypto` versions, encoding and locale settings, Drizzle migration state, the V2 foundation marker, schema/table and index-definition digests, and the required PostGIS/Outbox index presence. Use `--scope LOCAL_REFERENCE` for a developer database. Use `PRODUCTION_EQUIVALENT` only when the source really is the intended staging or production-equivalent target.

Compare another target to the approved baseline without printing connection details:

```powershell
$env:V2_DATABASE_URL = '<comparison-target-url>'
npm.cmd run db:v2:parity -- --compare artifacts/release/database-parity-baseline.json --require-production-equivalent --write artifacts/release/database-parity-result.json
```

The command exits non-zero and reports `BLOCKED` for any mismatch. A local PostgreSQL result does not prove Render parity; record the target identity and operator outside the fingerprint JSON.

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
