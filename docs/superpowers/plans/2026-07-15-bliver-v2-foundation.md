# Bliver V2 Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean V2 monorepo foundation that can boot a strict TypeScript Web/API pair against PostgreSQL + PostGIS, publish shared contracts, enforce dependency boundaries, and pass CI without changing the frozen V1 runtime.

**Architecture:** Add `apps/web`, `apps/api`, and the shared `packages/*` workspaces beside the frozen `frontend/` and `backend/` directories. V2 uses Express 5, React, Vite, Vitest, Drizzle, PostgreSQL/PostGIS, Zod/OpenAPI contracts, and a minimal Natural City shell. V1 remains runnable through the existing scripts until the later cutover phase.

**Tech Stack:** Node.js 24.16.0, npm workspaces, TypeScript strict mode, React 19, Vite, Express 5, Vitest, Supertest, Drizzle ORM/Drizzle Kit, `pg`, Zod, `openapi-typescript`, Socket.IO, Testcontainers, dependency-cruiser, Tailwind CSS, Playwright configuration groundwork.

---

## Scope and invariants

- Do not modify runtime code under `frontend/` or `backend/` except documentation references needed to label them as V1.
- Do not delete MongoDB, existing package locks, current Render settings, or current release scripts in Phase 1.
- Do not add product behavior beyond health/readiness, route-owned empty states, shared contracts, and database connectivity.
- Every new runtime file is `.ts` or `.tsx`; `.mjs` is allowed only for tooling configuration that a Node tool requires.
- Every task ends with a focused test command and a small commit.
- The Phase 1 exit command is `npm run verify:v2-foundation`.

## File map

### New workspace files

- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`: V2 Web package and strict build/test entry.
- `apps/web/index.html`, `apps/web/src/main.tsx`: browser entry.
- `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/routes/RoutePlaceholder.tsx`: route composition and mobile-first shell.
- `apps/web/src/app/__tests__/router.test.tsx`: route and shell smoke test.
- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`: V2 API package and Node test entry.
- `apps/api/src/bootstrap/config.ts`, `apps/api/src/bootstrap/server.ts`: validated config and graceful server lifecycle.
- `apps/api/src/http/app.ts`, `apps/api/src/http/error-handler.ts`, `apps/api/src/http/health.ts`: Express composition and health contracts.
- `apps/api/src/http/__tests__/health.test.ts`: REST health/readiness test.
- `apps/api/src/platform/db/client.ts`, `apps/api/src/platform/db/migrate.ts`, `apps/api/src/platform/db/seed.ts`: database connection and local commands.
- `apps/api/src/platform/db/__tests__/postgis.integration.test.ts`: real PostGIS integration test.
- `apps/api/drizzle.config.ts`, `apps/api/drizzle/0000_extensions.sql`: Drizzle configuration and PostGIS extension migration.

### New shared packages

- `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`: public contract exports.
- `packages/contracts/src/errors.ts`, `packages/contracts/src/health.ts`, `packages/contracts/src/events.ts`, `packages/contracts/src/openapi.ts`: Problem Details, health DTOs, event envelope schemas, and the OpenAPI document builder.
- `packages/contracts/src/__tests__/contracts.test.ts`: schema and serialization tests.
- `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`, `packages/domain/src/visibility.ts`: pure shared values and privacy preview rules.
- `packages/domain/src/__tests__/visibility.test.ts`: domain rule tests.
- `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/tokens.css`, `packages/ui/src/Button.tsx`, `packages/ui/src/Surface.tsx`, `packages/ui/src/index.ts`: Natural City primitives.
- `packages/ui/src/__tests__/primitives.test.tsx`: accessible primitive smoke tests.
- `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint.base.mjs`, `packages/config/vitest.base.ts`: shared tool configuration.
- `packages/testing/package.json`, `packages/testing/src/index.ts`, `packages/testing/src/test-env.ts`: shared test setup and environment helpers.

### Root and tooling files

- `package.json`: add workspaces and V2 scripts while preserving V1 scripts.
- `tsconfig.base.json`: root strict compiler baseline.
- `vitest.config.ts`: root workspace test discovery.
- `.dependency-cruiser.cjs`: V2 import boundary rules.
- `scripts/v2-architecture-check.ts`, `scripts/v2-foundation-smoke.ts`: executable architecture and smoke checks.
- `scripts/__tests__/v2-foundation-smoke.test.ts`, `scripts/__tests__/documentation.test.ts`: smoke and documentation contract tests.
- `infra/docker-compose.postgres.yml`: local PostgreSQL + PostGIS service.
- `.github/workflows/ci.yml`: add a V2 foundation job; keep current V1 jobs until cutover.
- `docs/architecture/v2-foundation.md`: developer entrypoint and command contract.
- `.env.v2.example`: names only, no real values.

## Task 1: Add the workspace manifest without touching V1 runtime

**Files:**
- Modify: `package.json`
- Create: `apps/web/package.json`, `apps/api/package.json`, `packages/contracts/package.json`, `packages/domain/package.json`, `packages/ui/package.json`, `packages/config/package.json`, `packages/testing/package.json`
- Test: `scripts/__tests__/v2-workspace.test.ts`

- [ ] **Step 1: Write the failing workspace manifest test**

Create a Vitest test that reads the root manifest and asserts the exact workspace globs and package names:

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('V2 workspace manifest', () => {
  it('declares only the V2 apps and shared packages', async () => {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.workspaces).toEqual(['apps/*', 'packages/*']);
    expect(pkg.engines.node).toBe('>=24 <25');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd exec vitest run scripts/__tests__/v2-workspace.test.ts`

Expected: FAIL because the root manifest has no `workspaces` field.

- [ ] **Step 3: Add the manifests and preserve the V1 scripts**

Add the workspace field, V2-only scripts, and root tooling dependencies to the root manifest. Keep the existing V1 scripts unchanged:

```json
{
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:v2": "concurrently -n web,api -c blue,green \"npm run dev --workspace @bliver/web\" \"npm run dev --workspace @bliver/api\"",
    "build:v2": "npm run build --workspaces --if-present",
    "test:v2": "npm run test --workspaces --if-present",
    "typecheck:v2": "npm run typecheck --workspaces --if-present",
    "lint:v2": "npm run lint --workspaces --if-present",
    "architecture:check": "tsx scripts/v2-architecture-check.ts",
    "verify:v2-foundation": "npm run architecture:check && npm run typecheck:v2 && npm run lint:v2 && npm run test:v2 && npm run build:v2"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "concurrently": "^9.2.1",
    "dependency-cruiser": "^16.10.4",
    "eslint": "^10.2.1",
    "globals": "^17.5.0",
    "tsx": "^4.19.4",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.63.0",
    "vitest": "^4.1.6"
  }
}
```

Each new package has a unique `@bliver/*` name, `private: true`, `type: module`, and `engines.node: ">=24 <25"`. Add these exact workspace scripts to `apps/web` and `apps/api`: `dev`, `build`, `test`, `typecheck`, and `lint`. The Web `dev` script runs `vite --port 5173`; the API `dev` script runs `tsx watch src/bootstrap/server.ts --port 5100`. Do not add runtime dependencies until the task that owns them.

- [ ] **Step 4: Install the workspace lockfile and run the manifest test**

Run: `npm.cmd install --package-lock-only --ignore-scripts`

Run: `npm.cmd exec vitest run scripts/__tests__/v2-workspace.test.ts`

Expected: PASS and a root `package-lock.json` containing the workspace packages. Existing `frontend/package-lock.json` and `backend/package-lock.json` remain untouched.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json apps packages scripts/__tests__/v2-workspace.test.ts
git commit -m "build: add V2 workspace foundation"
```

## Task 2: Establish strict TypeScript and shared tool configuration

**Files:**
- Create: `tsconfig.base.json`, `vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/api/vitest.config.ts`, `packages/config/tsconfig.base.json`, `packages/config/eslint.base.mjs`, `packages/config/vitest.base.ts`
- Modify: each V2 package `tsconfig.json` and `package.json`
- Test: `packages/config/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing config contract test**

Assert that the shared compiler baseline enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `noEmit` for app packages.

- [ ] **Step 2: Run the focused test**

Run: `npm.cmd exec vitest run packages/config/src/__tests__/config.test.ts`

Expected: FAIL because the config files do not exist.

- [ ] **Step 3: Add the strict compiler baseline**

Create `tsconfig.base.json` with `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `noEmit: true`, `isolatedModules: true`, and `skipLibCheck: true`. Web overrides `module: ESNext`, `moduleResolution: Bundler`, and `jsx: react-jsx`; API keeps NodeNext.

Create one shared ESLint flat config that enables `typescript-eslint` recommended rules, React Hooks rules, import boundary rules, and no explicit `any` in V2 source. Test files may use test-library globals through a separate config block. `apps/web/vitest.config.ts` uses jsdom and Testing Library setup; `apps/api/vitest.config.ts` uses node and a 30-second timeout; both extend the shared Vitest config.

- [ ] **Step 4: Verify all V2 packages typecheck with no source implementation**

Run: `npm.cmd run typecheck:v2`

Expected: PASS with zero diagnostics after package entry files contain only typed empty exports.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json vitest.config.ts packages/config apps/*/tsconfig.json packages/*/tsconfig.json
git commit -m "build: enforce strict TypeScript for V2"
```

## Task 3: Add shared contracts and pure domain primitives

**Files:**
- Create: `packages/contracts/src/errors.ts`, `packages/contracts/src/health.ts`, `packages/contracts/src/events.ts`, `packages/contracts/src/openapi.ts`, `packages/contracts/src/index.ts`
- Create: `packages/domain/src/ids.ts`, `packages/domain/src/visibility.ts`, `packages/domain/src/index.ts`
- Test: `packages/contracts/src/__tests__/contracts.test.ts`, `packages/domain/src/__tests__/visibility.test.ts`
- Modify: `packages/contracts/package.json`, `package-lock.json`

- [ ] **Step 1: Write contract and domain tests first**

Cover these exact behaviors:

```ts
expect(healthResponse.parse({ status: 'ok', version: 'test', environment: 'test' })).toEqual(...);
expect(problemDetails.parse({ type: 'about:blank', title: 'Invalid request', status: 400, code: 'VALIDATION_ERROR' })).toBeTruthy();
expect(canDiscover({ visibility: 'public', discoveryExpiresAt: future })).toBe(true);
expect(canDiscover({ visibility: 'public', discoveryExpiresAt: past })).toBe(false);
expect(canDiscover({ visibility: 'private', discoveryExpiresAt: future })).toBe(false);
```

Use Zod schemas for `HealthResponse`, `ProblemDetails`, `EventEnvelope`, `Visibility`, and `LocationPrecision`. Add branded UUIDv7 types `UserId`, `FootprintId`, `ConversationId`, and `EventId` in `ids.ts`, generated through the `uuid` package and validated at boundaries. Add `openapi.ts` that builds a minimal OpenAPI 3.1 document for `/healthz`, `/readyz`, `/versionz`, and the Problem Details response. Add `@asteasolutions/zod-to-openapi` and `openapi-typescript` to the contracts tooling, plus a `contracts:openapi` package script that writes `artifacts/openapi/v2.json` and generated type output to `packages/contracts/generated/` without committing generated runtime code. Domain functions accept typed values and never read the clock or environment directly; pass `now` as an argument.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm.cmd exec vitest run packages/contracts/src/__tests__/contracts.test.ts packages/domain/src/__tests__/visibility.test.ts`

Expected: FAIL because schemas and pure functions do not exist.

- [ ] **Step 3: Implement the minimal schemas, OpenAPI document, and pure functions**

Export only public types and functions from each package `index.ts`. Keep the server authoritative: the shared domain function is for client preview and server reuse, while API handlers must invoke the server policy again. Validate the generated OpenAPI document in the contract test and assert that its paths match the schemas.

- [ ] **Step 4: Run tests and build the packages**

Run: `npm.cmd exec vitest run packages/contracts/src/__tests__/contracts.test.ts packages/domain/src/__tests__/visibility.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/domain
git commit -m "feat: add shared V2 contracts and domain primitives"
```

## Task 4: Create Natural City UI primitives

**Files:**
- Create: `packages/ui/src/tokens.css`, `packages/ui/src/Button.tsx`, `packages/ui/src/Surface.tsx`, `packages/ui/src/index.ts`
- Test: `packages/ui/src/__tests__/primitives.test.tsx`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Write component tests**

Test that `Button` renders a native button, exposes its accessible name, supports `disabled`, and preserves a 44px minimum height. Test that `Surface` renders semantic content without owning feature state.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd exec vitest run packages/ui/src/__tests__/primitives.test.tsx`

Expected: FAIL because primitives do not exist.

- [ ] **Step 3: Implement tokens and primitives**

Add the approved Natural City values: warm paper `#FAF8F3`, forest `#173B31`, forest-soft `#2D594D`, coral `#C54B36`, coral-active `#AD3D2D`, ink `#1E2925`, muted ink `#5D7068`, border `#D7E1DC`, success/warning/danger/info semantic tokens. Add reduced-motion variables and visible focus styles. Do not add gradients, glow shadows, black glass, or feature-specific components.

Add `react`, `react-dom`, `lucide-react`, and `@testing-library/react` as the package dependencies/devDependencies required by the primitive tests. Do not add Tailwind-specific UI abstractions to this package.

- [ ] **Step 4: Run tests and lint**

Run: `npm.cmd exec vitest run packages/ui/src/__tests__/primitives.test.tsx`

Run: `npm.cmd run lint:v2`

Expected: PASS with zero warnings in V2 packages.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat: add Natural City UI foundation"
```

## Task 5: Provision PostgreSQL + PostGIS and Drizzle

**Files:**
- Create: `infra/docker-compose.postgres.yml`, `.env.v2.example`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/0000_extensions.sql`
- Create: `apps/api/src/platform/db/client.ts`, `apps/api/src/platform/db/migrate.ts`, `apps/api/src/platform/db/seed.ts`
- Test: `apps/api/src/platform/db/__tests__/postgis.integration.test.ts`
- Modify: `apps/api/package.json`, root `package.json`, `package-lock.json`

- [ ] **Step 1: Write the integration test**

Add `testcontainers` and `@testcontainers/postgresql` to the root devDependencies. Start a Testcontainers PostgreSQL image with PostGIS, run the migration command, and assert:

```sql
SELECT PostGIS_Version() IS NOT NULL;
SELECT current_database() = 'bliver_v2_test';
```

The test must also run the migration twice and assert the second run is a no-op.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd exec vitest run --config apps/api/vitest.config.ts apps/api/src/platform/db/__tests__/postgis.integration.test.ts`

Expected: FAIL because the container helper, migration, and Drizzle client do not exist.

- [ ] **Step 3: Add the local PostGIS service and migration**

Use `postgis/postgis:16-3.4` with database `bliver_v2`, user `bliver`, and a local-only password in `.env.v2`. `0000_extensions.sql` must execute `CREATE EXTENSION IF NOT EXISTS postgis;`, `CREATE EXTENSION IF NOT EXISTS pgcrypto;`, and create `platform.system_markers(id text primary key, created_at timestamptz not null default now())`. Do not create product tables in Phase 1.

- [ ] **Step 4: Implement typed DB lifecycle**

`client.ts` exports `createDb(databaseUrl: string)` and `closeDb()`. Add `dotenv` to the API runtime dependencies and make `migrate.ts` and `seed.ts` load `.env.v2` unless `ENV_FILE` is set. Each command accepts `DATABASE_URL` from the validated environment, runs Drizzle migrations, and exits non-zero on any error. `seed.ts` upserts exactly one deterministic `v2-foundation` marker into `platform.system_markers`.

- [ ] **Step 5: Run the integration test and commit**

Run: `docker compose -f infra/docker-compose.postgres.yml up -d`

Run: `npm.cmd exec vitest run --config apps/api/vitest.config.ts apps/api/src/platform/db/__tests__/postgis.integration.test.ts`

Expected: PASS, including the repeated migration assertion.

```bash
git add infra .env.v2.example apps/api/drizzle.config.ts apps/api/drizzle apps/api/src/platform/db apps/api/package.json package.json package-lock.json
git commit -m "feat: provision V2 PostGIS database foundation"
```

## Task 6: Build the typed Express API shell

**Files:**
- Create: `apps/api/src/bootstrap/config.ts`, `apps/api/src/bootstrap/server.ts`
- Create: `apps/api/src/http/app.ts`, `apps/api/src/http/error-handler.ts`, `apps/api/src/http/health.ts`
- Test: `apps/api/src/http/__tests__/health.test.ts`
- Modify: `apps/api/package.json`, `package-lock.json`

- [ ] **Step 1: Write REST tests**

Cover exact responses:

```text
GET /healthz  -> 200 { status: "ok", version, environment }
GET /readyz   -> 200 when db SELECT 1 succeeds
GET /versionz -> 200 with release SHA and environment
GET /missing  -> Problem Details 404 with request ID
```

Inject a fake DB port into `createApp` so unit tests do not require Postgres. Add one integration test using the real client from Task 5.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd exec vitest run --config apps/api/vitest.config.ts apps/api/src/http/__tests__/health.test.ts`

Expected: FAIL because the Express app and routes do not exist.

- [ ] **Step 3: Implement config validation and app composition**

Add `express`, `helmet`, `cors`, `zod`, `pino`, and `pino-http` to the API runtime dependencies. `config.ts` validates `NODE_ENV`, `DEPLOY_ENV`, `RELEASE_SHA`, `DATABASE_URL`, and `SESSION_SECRET` with Zod. Cloudinary configuration is declared but optional until the Phase 3 Media module. `createApp({ db, config, logger })` mounts request ID middleware, JSON limits, security headers, health routes, a JSON 404 handler, and the Problem Details error handler.

- [ ] **Step 4: Implement lifecycle and graceful shutdown**

`server.ts` creates the HTTP server, registers SIGTERM/SIGINT handlers, stops accepting traffic, closes the DB pool, and exits with a bounded timeout. No domain module or Socket handler is added in Phase 1.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd exec vitest run --config apps/api/vitest.config.ts apps/api/src/http/__tests__/health.test.ts`

Expected: all API shell tests PASS.

```bash
git add apps/api/src/bootstrap apps/api/src/http
git commit -m "feat: add typed V2 Express API shell"
```

## Task 7: Build the Web/PWA shell and route contract

**Files:**
- Create: `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/routes/RoutePlaceholder.tsx`
- Test: `apps/web/src/app/__tests__/router.test.tsx`
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `package-lock.json`

- [ ] **Step 1: Write route and shell tests**

Render the router under a memory history and assert that `/map`, `/activity`, `/messages`, `/me`, `/profile/test-user`, `/footprints/test-footprint`, and `/admin` each render a route-owned empty state with an accessible heading. Assert that the shell exposes four navigation destinations and a separate publish action.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd exec vitest run --config apps/web/vitest.config.ts apps/web/src/app/__tests__/router.test.tsx`

Expected: FAIL because the V2 Web shell does not exist.

- [ ] **Step 3: Implement the typed React entry**

`main.tsx` mounts `QueryClientProvider`, the router, a global Error Boundary, and imports `@bliver/ui/tokens.css`. `AppShell` owns only layout and accessibility landmarks. Route-owned empty states use Natural City primitives and explicitly mark product features as pending migration rather than reusing V1 components.

Add `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `@bliver/ui`, and `@bliver/contracts` to runtime dependencies; add `@vitejs/plugin-react`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite`, and `tailwindcss` to devDependencies.

- [ ] **Step 4: Configure Vite and dev proxy**

`vite.config.ts` enables React, Tailwind, Vitest jsdom, and proxies `/api` and `/socket.io` to `http://localhost:5100`. The V2 API uses port 5100 so V1’s current 5000 process remains available during migration.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd exec vitest run --config apps/web/vitest.config.ts apps/web/src/app/__tests__/router.test.tsx`

Run: `npm.cmd run build --workspace @bliver/web`

Expected: tests and production build PASS.

```bash
git add apps/web
git commit -m "feat: add V2 Web route and shell foundation"
```

## Task 8: Add architecture dependency enforcement

**Files:**
- Create: `.dependency-cruiser.cjs`, `scripts/v2-architecture-check.ts`
- Test: `scripts/__tests__/v2-architecture-check.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing architecture fixture test**

Create a temporary fixture containing `apps/web/src/bad.ts` importing `apps/api/src/bootstrap/config.ts`. Assert the checker exits non-zero and prints `web-to-api-internal`.

- [ ] **Step 2: Implement dependency rules**

Add rules for:

```text
web -> api internal: forbidden
api -> web/ui feature: forbidden
domain -> node/db/http: forbidden
module -> another module infrastructure: forbidden
contracts -> apps: forbidden
```

Allow only public `@bliver/*` package exports. Ignore `dist`, V1 directories, test fixtures, and generated OpenAPI files.

- [ ] **Step 3: Run the checker against V2**

Run: `npm.cmd run architecture:check`

Expected: PASS with zero violations. Run the fixture test and expect the intentional violation to fail.

- [ ] **Step 4: Commit**

```bash
git add .dependency-cruiser.cjs scripts/v2-architecture-check.ts scripts/__tests__/v2-architecture-check.test.ts package.json
git commit -m "test: enforce V2 dependency boundaries"
```

## Task 9: Add root V2 commands and deterministic smoke verification

**Files:**
- Create: `scripts/v2-foundation-smoke.ts`, `scripts/__tests__/v2-foundation-smoke.test.ts`
- Modify: `package.json`, `.env.v2.example`, `docs/architecture/v2-foundation.md`

- [ ] **Step 1: Write the smoke test**

The test must assert that the script rejects missing `--api-url` or `--expected-release`, checks `GET /healthz`, `GET /readyz`, `GET /versionz`, and never prints environment values or response bodies on failure.

- [ ] **Step 2: Implement the smoke command**

The command accepts `--api-url`, `--expected-release`, and `--timeout-ms`, uses `fetch`, checks JSON content types and request IDs, and prints only method/path/status/duration. It exits non-zero on any failed check.

- [ ] **Step 3: Add the command contract**

Add exact root scripts. Keep verification deterministic and make the network smoke an explicit command that runs only when the API is already started:

```json
{
  "db:v2:up": "docker compose -f infra/docker-compose.postgres.yml up -d",
  "db:v2:migrate": "tsx apps/api/src/platform/db/migrate.ts",
  "db:v2:seed": "tsx apps/api/src/platform/db/seed.ts",
  "dev:v2": "concurrently -n web,api -c blue,green \"npm run dev --workspace @bliver/web\" \"npm run dev --workspace @bliver/api\"",
  "smoke:v2": "tsx scripts/v2-foundation-smoke.ts",
  "verify:v2-foundation": "npm run architecture:check && npm run lint:v2 && npm run typecheck:v2 && npm run test:v2 && npm run build:v2"
}
```

Document the expected ports, `DATABASE_URL`, `SESSION_SECRET`, Cloudinary variable names, and the distinction between V1 commands and V2 commands.

- [ ] **Step 4: Run the smoke test against the local API and commit**

Run: `npm.cmd exec vitest run scripts/__tests__/v2-foundation-smoke.test.ts`

Expected: all smoke tests PASS.

Start the API in a second terminal with `npm.cmd run dev --workspace @bliver/api`, then run `npm.cmd run smoke:v2 -- --api-url http://localhost:5100 --expected-release local`.

```bash
git add scripts/v2-foundation-smoke.ts scripts/__tests__/v2-foundation-smoke.test.ts package.json .env.v2.example docs/architecture/v2-foundation.md
git commit -m "test: add V2 foundation verification command"
```

## Task 10: Add the V2 CI foundation job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a V2 foundation job without removing V1 jobs**

Use Node 24 from `.nvmrc`, root `package-lock.json`, and the V2 workspace. Use a PostGIS service based on `postgis/postgis:16-3.4` with `POSTGRES_DB=bliver_v2_test`. Run `npm ci`, `npm run db:v2:migrate`, and `npm run verify:v2-foundation`. Do not require production secrets.

- [ ] **Step 2: Run the same command locally**

Run: `npm.cmd run verify:v2-foundation`

Expected: PASS locally with Docker running. CI must run the same root command, not a second hand-written test sequence.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify V2 foundation in pull requests"
```

## Task 11: Update canonical documentation without rewriting V1 behavior

**Files:**
- Modify: `README.md`, `AGENTS.md`, `CLAUDE.md`
- Create: `docs/architecture/v2-foundation.md`, `docs/operations/v2-local-development.md`
- Test: `scripts/__tests__/documentation.test.ts`

- [ ] **Step 1: Write documentation assertions**

Use a small Markdown test to assert that canonical docs mention Node 24, workspaces, `apps/web`, `apps/api`, PostgreSQL/PostGIS, V2 commands, and explicitly mark `frontend/` and `backend/` as frozen V1 reference code.

- [ ] **Step 2: Update stale architecture statements**

Remove the false React 18/react-leaflet v4/old CustomEvent descriptions from the canonical V2 section. Keep a short V1 reference note until Phase 8 deletes those directories. Do not claim V2 product modules are complete in Phase 1.

- [ ] **Step 3: Verify documentation and commit**

Run: `npm.cmd exec vitest run scripts/__tests__/documentation.test.ts`

Expected: PASS with no stale V2 claims.

```bash
git add README.md AGENTS.md CLAUDE.md docs/architecture docs/operations scripts/__tests__/documentation.test.ts
git commit -m "docs: document V2 foundation workflow"
```

## Task 12: Run the Phase 1 exit gate and record evidence

**Files:**
- Create: `docs/qa/v2-phase-1-foundation.md`

- [ ] **Step 1: Run the complete foundation verification**

Run, in order:

```bash
npm.cmd run check:node
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run verify:v2-foundation
npm.cmd run dev --workspace @bliver/api
npm.cmd run smoke:v2 -- --api-url http://localhost:5100 --expected-release local
npm.cmd --prefix frontend test
npm.cmd --prefix backend test
npm.cmd run test:release-tools
git diff --check
```

Run the API command in a separate terminal before the smoke command, then stop it after the smoke completes. Expected: every command exits zero; V2 API reports JSON health/readiness/version; Web build output exists; architecture checker reports zero violations; V1 tests remain unchanged and pass through their existing commands.

- [ ] **Step 2: Record exact evidence**

Record Node/npm versions, commit SHA, workspace package list, PostGIS version, test counts, lint/typecheck/build status, and the smoke command summary in `docs/qa/v2-phase-1-foundation.md`. Never record database passwords, tokens, URLs containing credentials, or response bodies.

- [ ] **Step 3: Commit the evidence and tag the phase**

```bash
git add docs/qa/v2-phase-1-foundation.md
git commit -m "qa: record V2 foundation exit evidence"
git tag v2-phase-1-foundation
```

## Phase 1 exit criteria

Phase 1 is complete only when all of the following are true:

- `apps/web` and `apps/api` boot independently with strict TypeScript.
- All V2 shared packages compile and expose only public exports.
- PostgreSQL + PostGIS starts locally, migrations are repeatable, and integration tests pass.
- API health/readiness/version routes return typed JSON and Problem Details errors.
- Web routes and Natural City shell render at the four navigation destinations plus deep-link routes.
- Architecture checker rejects all listed forbidden dependencies.
- Root V2 scripts and CI execute the same verification path.
- V1 runtime, tests, package locks, and Render deployment remain unchanged and green.
- QA evidence is committed and `v2-phase-1-foundation` is tagged.

## Handoff to Phase 2

After the Phase 1 tag, create a new design/plan pair for Identity & Access and App Shell behavior. Do not begin Footprints, Discovery, Social, Messaging, or Memories in the Phase 1 worktree. The current architecture spec remains the source of truth; any change to it requires a new design review before implementation.
