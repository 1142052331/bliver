# V2 Phase 1 Foundation QA Evidence

Status: **PASS**

Date: 2026-07-15 (Asia/Shanghai)
Branch: `codex/bliver-v2`
Implementation commit: `a2c1775d711e94d4fc92af4dac5171f462317271`
Rollback boundary: `d6f1452` (the last planning-only commit before Phase 1 implementation)

## Toolchain and workspaces

- Node.js: `v24.16.0`
- npm: `11.13.0`
- Workspaces: `@bliver/web`, `@bliver/api`, `@bliver/contracts`, `@bliver/domain`,
  `@bliver/ui`, `@bliver/config`, `@bliver/testing`
- Database migration: `apps/api/drizzle/0000_extensions.sql`
- PostgreSQL: `16.14` native Windows service
- PostGIS version: `3.6` (native provider via `V2_DATABASE_URL`)

## Exit gate evidence

| Command | Result | Evidence |
| --- | --- | --- |
| `npm.cmd run check:node` | PASS | Exit 0 on Node 24.16.0 |
| `npm.cmd run db:v2:migrate` | PASS | Native PostGIS database migrated twice; second run was a no-op |
| `npm.cmd run db:v2:seed` | PASS | Deterministic `v2-foundation` marker present |
| `V2_DATABASE_URL=... npm.cmd exec vitest -- --config apps/api/vitest.config.ts run apps/api/src/platform/db/__tests__/postgis.integration.test.ts` | PASS | PostGIS extension and repeated migration assertions passed |
| `npm.cmd run verify:v2-foundation` | PASS | 68 modules, lint, strict typecheck, 44 tests, and builds exited 0 |
| `npm.cmd run smoke:v2 -- --api-url http://127.0.0.1:5100 --expected-release local` | PASS | `/healthz`, `/readyz`, `/versionz` all returned 200 |
| `npm.cmd --prefix frontend test` | PASS | 58 files, 398 tests |
| `npm.cmd --prefix backend test` | PASS after rerun | 36 suites, 464 tests |
| `npm.cmd run test:release-tools` | PASS | 12 tests |
| `npm.cmd run render-build` | PASS | V1 lockfile installs and production Web build exited 0 |
| `git diff --check` | PASS | No whitespace errors |

The first full V1 backend run observed one timing-sensitive failure in the fixed-date discovery-window
TTL test. The focused test then passed 4/4 and the complete backend suite passed 464/464 on a fresh
rerun. No frozen V1 source or lockfile was changed.

## V2 verification detail

- Dependency Cruiser: 68 modules and 68 dependencies, zero violations.
- ESLint: all seven V2 workspaces passed with zero warnings.
- TypeScript: all seven V2 workspaces passed the strict compiler baseline.
- Vitest: 13 files passed, 44 tests passed; the PostGIS integration ran against the native provider.
- Web: Vite 8.1.4 production build completed and `apps/web/dist/index.html` exists.
- API network smoke: health, readiness, and version contracts all passed with the native database.

## Handoff

Docker remains an optional local provider. When it is unavailable, set `V2_DATABASE_URL` to a real
PostgreSQL + PostGIS test database and run the integration test through the native-provider path.
The V2 API still uses `DATABASE_URL`; no credentials or secret values are recorded in this evidence.

The Phase 1 exit gate is complete. The next phase may start from the tagged commit after this
evidence update.
