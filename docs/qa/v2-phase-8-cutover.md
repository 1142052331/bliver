# V2 Phase 8 QA: Canonical Cutover Evidence

Date: 2026-07-16  
Branch: `codex/bliver-v2-phase-8`  
Freeze source: `8aa34867ceefbb296721392cd5dda4b7a8dcd00b`  
Status: `RELEASE_READY_WITH_EXTERNAL_BLOCKERS`

## Acceptance Exception

The user explicitly authorized Phase 8 to start from exact SHA `8aa34867ceefbb296721392cd5dda4b7a8dcd00b` without a Phase 7 tag. This accepted the sequence change only. It did not convert missing live PostGIS, backup/restore, Render, remote version, or observation evidence into passes.

The untouched Phase 7 record is archived at [v2-phase-7-hardening.md](../archive/qa/v2-phase-7-hardening.md). Its blob matches the pre-archive blob `bae4e72437c690ed90ef1b186b94da396b354e6e`. The full pre-deletion path, package, environment, route, event, asset, root-script, CI, Render, Android, and documentation inventory is archived at [v2-phase-8-deletion-inventory.md](../archive/qa/v2-phase-8-deletion-inventory.md).

## Task Evidence

| Task | Command/evidence | Result |
| --- | --- | --- |
| 1 freeze | `npm run release:v2:freeze` | PASS twice; each pass exited 0 |
| 1 counts | structured Vitest reports | 187 passed suites, 349 passed tests, 7 skipped in each pass |
| 1 OpenAPI | `artifacts/release/phase-7-freeze.json` | 40 paths; identical SHA-256 `a30db6c6b1be71a5f71d5cef47ab3c78188292612d51303d630e4a1fe725d37c` |
| 1 manifest | `artifacts/release/v2-candidate-manifest.json` | freeze SHA, Node/npm, root lock, migrations, and asset-list hashes recorded |
| 2 inventory boundary | pre-deletion automated boundary | PASS; no V2 runtime import or direct dependency on the removed roots |
| 3 focused contracts | static Web, candidate, deployment, production config | PASS, 11/11 |
| 3 root release tools | V2 smoke and CI config tests | PASS, 7/7 |
| 3 V2 gate | `npm run verify:v2-foundation` | PASS, 93 files passed / 3 skipped; 363 tests passed / 7 skipped |
| 3 candidate build | exact local HEAD identity | PASS; identity checked before build, API/Web outputs present, candidate rechecked |
| 3 negative identity | mismatched provider commit | EXPECTED BLOCK, exit 1 before build or database write |
| 3 mobile | `npm run cap:v2:smoke` | PASS, 6 Vitest + 1 Playwright + Android sync |
| 4 pre-delete exit | `npm run cutover:v2:check` | EXPECTED BLOCK on both removed roots and old root release tooling |
| 4 safe deletion | resolved parent/leaf validation plus native PowerShell removal | PASS; both exact worktree targets absent afterward |
| 4 direct dependency removal | `npm ls` for removed database/token packages | Empty dependency graph |
| 4 exit boundary | cutover unit and live-tree checks | PASS, 2/2 and V2-only tree |
| 4 V2 gate | `npm run verify:v2-foundation` | PASS, 93 files passed / 3 skipped; 362 tests passed / 7 skipped |
| 4 candidate build | exact local HEAD identity after deletion | PASS |
| 4 release tools | `npm run test:release-tools` | PASS, 7/7 |
| 5 documentation | `scripts/__tests__/documentation.test.ts` | PASS, 6/6 |
| 6 clean checkout | detached `0cc9f494b1636a0c08147df7c37e0c43bae38f4c` plus `npm ci --no-audit --no-fund` | PASS; no `node_modules`, real `.env`, `dist`, or generated output before install; 959 packages installed |
| 6 structured record | `artifacts/release/phase-8-clean-verification.json` | PASS; exact SHA, commands, exit codes, counts, metrics, probes, cleanup, and blocked database work recorded without values or response bodies |
| 6 clean foundation | `npm run check:node` and `npm run verify:v2-foundation` | PASS; architecture 754 modules / 725 dependencies; 93 files passed / 3 skipped; 366 tests passed / 7 skipped |
| 6 exact candidate | exact-SHA `npm run render-build` | PASS; runtime packages, API, and Web emitted; plain Node imported the emitted API module graph |
| 6 production process | `node apps/api/dist/bootstrap/server.js` with isolated local probe configuration | PASS; process listened and was stopped after probes; stdout 9,099 bytes, stderr empty, session secret and database URL absent from logs |
| 6 production HTTP | same-origin process probes | PASS; health 200, readiness 503 without PostGIS, exact version 200, root/deep link 200, unauthenticated API 401, Socket polling 200, manifest/worker/icons 200, missing asset 404 |
| 6 browser | full Playwright with `CI=1` | PASS, 120/120; no existing server reused |
| 6 browser performance | `npm run perf:v2:browser-evidence` | PASS, 8/8; reconnect max 34.8 ms, INP max 24 ms |
| 6 local performance | `npm run perf:v2` | PASS after fresh browser evidence; main bundle 193,977 bytes gzip; live PostGIS EXPLAIN explicitly skipped |
| 6 database and recovery | Docker daemon, PostGIS migrate/seed, live EXPLAIN, backup/restore | BLOCKED; Docker Desktop could not start, so no live database or recovery evidence exists |
| 7 immutable candidate | exact-SHA `npm run render-build` at `e9b10e392e2fd6ce410798dc4873246c33f438a9` | PASS; final runtime package, API, Web, and plain-Node import candidate |
| 7 candidate manifest | `artifacts/release/v2-candidate-manifest.json` | PASS; SHA-256 `bb084e2960877c991424df4cb07a5f5c4522ad9750d44775774275961797eda8`; 10 migrations and 10 assets |
| 7 baseline | `artifacts/release/v2-baseline.json` | `RELEASE_READY_WITH_EXTERNAL_BLOCKERS`; SHA lineage, checksums, counts, metrics, environment key names, and blocked publication gates recorded |
| 7 foundation | `npm run verify:v2-foundation` | PASS; architecture 754 modules / 725 dependencies; 93 files passed / 3 skipped; 366 tests passed / 7 skipped |
| 7 browser | full Playwright and isolated performance evidence | PASS, 120/120 and 8/8; reconnect max 51.6074 ms, INP max 32 ms |
| 7 Lighthouse/performance | Lighthouse plus local and release-strict performance | local PASS; score 1, LCP 277.744 ms, CLS 0; strict EXPECTED BLOCK only on missing live PostGIS EXPLAIN |
| 7 publication | Render, remote `/versionz`, backup/restore, observation, `v2.0.0` | BLOCKED / NOT CREATED; no external result is claimed |

Task 3 initially proved that the inherited TypeScript configuration emitted no API artifact. Candidate verification blocked on the missing server. The dedicated API production build configuration now emits `apps/api/dist/bootstrap/server.js`; a fresh ordered candidate build passed. No migration ran during either build.

Task 4 removed 305 tracked application files plus child locks, data models/config, token middleware, routes/events, backfills, compatibility UI, and old assets. It also removed the old root verifier and temporary inventory implementation after the inventory was committed. The retained `cutover:v2:check` verifies a V2-only runtime and direct dependency graph.

The root lock contains `@opentelemetry/instrumentation-mongodb` and `@opentelemetry/instrumentation-mongoose`, brought transitively by the required Sentry API integration and Lighthouse toolchain. `npm ls` proves that `mongodb`, `mongoose`, `mongodb-memory-server`, and `jsonwebtoken` are not installed. These are third-party instrumentation-name exceptions, not database drivers or application data paths.

The first Task 6 clean checkout at `a3d39641e2b0f3e5c1953ce73ba2f7f31fe66dfb` exposed a production-only blocker after the static and browser gates passed: the emitted API imported workspace packages whose exports still targeted TypeScript source. Plain Node failed before binding with `ERR_MODULE_NOT_FOUND` for `packages/domain/src/ids.js`. Regression tests now prove that candidate verification rejects both a missing emitted dependency and a `tsx` source-resolution fallback. `domain`, `contracts`, and `ui` emit runtime distributions in dependency order before API and Web builds, and candidate verification imports the emitted server in an independent plain Node process. The repaired clean checkout and production probes above passed at `0cc9f494b1636a0c08147df7c37e0c43bae38f4c`.

## Current Release Topology

- `npm run render-build`: verify exact identity, emit runtime packages in dependency order, emit API, build Web, and import the emitted API graph with plain Node.
- `npm run release:v2:predeploy`: verify the same candidate, then migrate PostGIS.
- `npm start`: run the emitted API and same-origin Web/Socket service.
- `/healthz`, `/readyz`, `/versionz`: health, database readiness, exact release.
- `/api/v1`: versioned HTTP contract.
- `/socket.io`: realtime transport.
- `apps/web/dist`: PWA and Capacitor Web assets.

## Publish Baseline Decision

The immutable, locally verified release candidate is `e9b10e392e2fd6ce410798dc4873246c33f438a9`. The commit containing this baseline record is evidence-only and is not represented as a deployed release. A future deployment must either use that exact candidate or freeze and re-run the complete release gate for a newer SHA.

Local non-database gates are green, but the release exit gate is incomplete. Publication status remains `BLOCKED`, `v2.0.0` does not exist, and no Render deployment, remote release match, backup/restore, or observation result is claimed.

## External Blockers

- No real Render deployment credentials or deployment result are available.
- No remote `/versionz` exact-SHA result exists.
- No remote observation window or baseline has started.
- Backup and isolated restore have not yet been exercised against a real candidate database.
- Docker Desktop could not start in the clean-room environment. `db:v2:up` could not reach a daemon, migrate could not create the Drizzle schema, and seed received `ECONNREFUSED 127.0.0.1:54329`.
- No live PostGIS readiness, migration/seed, query-plan, or release-performance result is claimed.

Therefore no production publication, remote observation, Phase 7 tag, or `v2.0.0` tag is claimed.
