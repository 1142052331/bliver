# V2 Phase 1 Foundation QA Evidence

Status: **DONE WITH CONCERNS - Docker/PostGIS exit gate blocked**

Date: 2026-07-15 (Asia/Shanghai)
Branch: `codex/bliver-v2`
Implementation commit: `9c83fb7aecc19b42e23a57a98208b2f3b2137d2b`
Rollback boundary: `d6f1452` (the last planning-only commit before Phase 1 implementation)

## Toolchain and workspaces

- Node.js: `v24.16.0`
- npm: `11.13.0`
- Workspaces: `@bliver/web`, `@bliver/api`, `@bliver/contracts`, `@bliver/domain`,
  `@bliver/ui`, `@bliver/config`, `@bliver/testing`
- Database migration: `apps/api/drizzle/0000_extensions.sql`
- PostGIS version: unavailable because the local Docker daemon could not start

## Exit gate evidence

| Command | Result | Evidence |
| --- | --- | --- |
| `npm.cmd run check:node` | PASS | Exit 0 on Node 24.16.0 |
| `npm.cmd run db:v2:up` | BLOCKED | Docker Desktop could not connect to its Linux engine pipe |
| `npm.cmd run db:v2:migrate` | BLOCKED | No PostgreSQL service was available after Docker failed to start |
| `npm.cmd run verify:v2-foundation` | PASS | Architecture, lint, typecheck, tests, and builds exited 0 |
| `npm.cmd run smoke:v2 -- --api-url http://127.0.0.1:5100 --expected-release local` | PARTIAL | `/healthz` 200, `/readyz` 503, `/versionz` 200 |
| `npm.cmd --prefix frontend test` | PASS | 58 files, 398 tests |
| `npm.cmd --prefix backend test` | PASS after rerun | 36 suites, 464 tests |
| `npm.cmd run test:release-tools` | PASS | 12 tests |
| `npm.cmd run render-build` | PASS | V1 lockfile installs and production Web build exited 0 |
| `git diff --check` | PASS | No whitespace errors |

The first full V1 backend run observed one timing-sensitive failure in the fixed-date discovery-window
TTL test. The focused test then passed 4/4 and the complete backend suite passed 464/464 on a fresh
rerun. No frozen V1 source or lockfile was changed.

## V2 verification detail

- Dependency Cruiser: 65 modules and 65 dependencies, zero violations.
- ESLint: all seven V2 workspaces passed with zero warnings.
- TypeScript: all seven V2 workspaces passed the strict compiler baseline.
- Vitest: 10 files passed, 38 tests passed.
- Skipped: one real Testcontainers/PostGIS migration test because `docker info` was unavailable.
- Web: Vite 8.1.4 production build completed and `apps/web/dist/index.html` exists.
- API network smoke: health and version contracts passed; readiness correctly failed closed when the
  database was unavailable.

## Blocker and handoff

The Windows `com.docker.service` was initially stopped. Starting it succeeded briefly, but Docker
Desktop failed to initialize its Linux engine and reported `Docker Desktop is unable to start`; the
service returned to stopped. Consequently the PostGIS extension version, repeated real migration,
seed marker, and successful readiness smoke remain unverified on this machine.

Do not create the `v2-phase-1-foundation` completion tag or start Phase 2 until a Docker-capable
environment runs these commands successfully:

```bash
npm run db:v2:up
npm run db:v2:migrate
npm exec vitest run --config=apps/api/vitest.config.ts apps/api/src/platform/db/__tests__/postgis.integration.test.ts
npm run smoke:v2 -- --api-url http://localhost:5100 --expected-release local
```

After those pass, record the PostGIS version and successful readiness response here, commit the
updated evidence, and create the Phase 1 tag.
