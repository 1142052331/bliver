# V2 Phase 8 QA: Canonical Cutover Evidence

Date: 2026-07-17
Branch: `codex/bliver-v2-phase-8`  
Freeze source: `8aa34867ceefbb296721392cd5dda4b7a8dcd00b`  
Status: `RELEASE_READY_WITH_EXTERNAL_BLOCKERS`

## Acceptance Exception

The user explicitly authorized Phase 8 to start from exact SHA `8aa34867ceefbb296721392cd5dda4b7a8dcd00b` without a Phase 7 tag. This accepted the sequence change only. It did not convert missing live PostGIS, backup/restore, Render, remote version, or observation evidence into passes.

The untouched Phase 7 record is archived at [v2-phase-7-hardening.md](../archive/qa/v2-phase-7-hardening.md). Its blob matches the pre-archive blob `bae4e72437c690ed90ef1b186b94da396b354e6e`. The full pre-deletion path, package, environment, route, event, asset, root-script, CI, Render, Android, and documentation inventory is archived at [v2-phase-8-deletion-inventory.md](../archive/qa/v2-phase-8-deletion-inventory.md).

## Task Evidence

| Task | Command/evidence | Result |
| --- | --- | --- |
| 1 initial freeze | historical `8aa3486` freeze committed at `dd47ac4` | PASS twice; 187 passed suites, 349 passed tests, 7 skipped in each pass |
| 1 initial OpenAPI | historical `8aa3486` freeze | 40 paths; identical SHA-256 `a30db6c6b1be71a5f71d5cef47ab3c78188292612d51303d630e4a1fe725d37c` |
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
| 7 review regressions | deployment topology and frozen inventory tests | PASS, 7/7; real YAML is parsed into `createConfig`, mobile origin is cross-checked, and Git-tree assets equal documentation |
| 7 production topology | `render.yaml`, Capacitor config, Android manifest | PASS; service `bliver`, `DEPLOY_ENV=production`, and `https://bliver.onrender.com` agree |
| 7 frozen inventory | `git ls-tree 8aa3486 -- frontend/public` | PASS; all 5 tracked assets, including `manifest.json` and `sw.js`, exactly match the archived inventory |
| 7 Lighthouse cleanup | keep-alive/profile regression plus real gates | PASS, 5/5; two standalone and both freeze-pass Lighthouse runs exited without process/profile leaks |
| 7 release smoke review | canonical V2 health contract plus `npm run test:release-tools` | P1 FIXED at `52c20d844e31d451da2c7634243fa97877c6c076`; 7/7 pass with `/healthz`, `/readyz`, and `/versionz` exact `version` checks |
| 7 re-freeze | `npm run release:v2:freeze` at `52c20d844e31d451da2c7634243fa97877c6c076` | PASS twice; 201 suites, 374 tests, 7 PostgreSQL skips, matching 40-path OpenAPI hash |
| 7 immutable candidate | exact-SHA `npm run render-build` at `52c20d844e31d451da2c7634243fa97877c6c076` | PASS; final runtime package, API, Web, and plain-Node import candidate; provider SHA cross-check enabled |
| 7 candidate manifest | `artifacts/release/v2-candidate-manifest.json` | PASS; SHA-256 `8589a0ab86ef092b68662573eb0a7bebde2e66a4c41ddbd12c738f62d7c89a16`; 10 migrations and 10 assets |
| 7 baseline | `artifacts/release/v2-baseline.json` | `RELEASE_READY_WITH_EXTERNAL_BLOCKERS`; SHA lineage, checksums, counts, metrics, environment key names, and blocked publication gates recorded |
| 7 foundation | each freeze pass | PASS; architecture 754 modules / 725 dependencies; 95 files passed / 3 skipped; 374 tests passed / 7 skipped |
| 7 browser | each freeze pass plus final isolated evidence | PASS, 120/120 and 8/8; reconnect max 46.9262 ms, INP max 24 ms |
| 7 Lighthouse/performance | Lighthouse plus local and release-strict performance | local PASS; score 1, LCP 188.504 ms, CLS 0; strict EXPECTED BLOCK only on missing live PostGIS EXPLAIN |
| 7 publication | Render, remote `/versionz`, backup/restore, observation, `v2.0.0` | BLOCKED / NOT CREATED; no external result is claimed |

Task 3 initially proved that the inherited TypeScript configuration emitted no API artifact. Candidate verification blocked on the missing server. The dedicated API production build configuration now emits `apps/api/dist/bootstrap/server.js`; a fresh ordered candidate build passed. No migration ran during either build.

Task 4 removed 305 tracked application files plus child locks, data models/config, token middleware, routes/events, backfills, compatibility UI, and old assets. It also removed the old root verifier and temporary inventory implementation after the inventory was committed. The retained `cutover:v2:check` verifies a V2-only runtime and direct dependency graph.

The root lock contains `@opentelemetry/instrumentation-mongodb` and `@opentelemetry/instrumentation-mongoose`, brought transitively by the required Sentry API integration and Lighthouse toolchain. `npm ls` proves that `mongodb`, `mongoose`, `mongodb-memory-server`, and `jsonwebtoken` are not installed. These are third-party instrumentation-name exceptions, not database drivers or application data paths.

The first Task 6 clean checkout at `a3d39641e2b0f3e5c1953ce73ba2f7f31fe66dfb` exposed a production-only blocker after the static and browser gates passed: the emitted API imported workspace packages whose exports still targeted TypeScript source. Plain Node failed before binding with `ERR_MODULE_NOT_FOUND` for `packages/domain/src/ids.js`. Regression tests now prove that candidate verification rejects both a missing emitted dependency and a `tsx` source-resolution fallback. `domain`, `contracts`, and `ui` emit runtime distributions in dependency order before API and Web builds, and candidate verification imports the emitted server in an independent plain Node process. The repaired clean checkout and production probes above passed at `0cc9f494b1636a0c08147df7c37e0c43bae38f4c`.

Specification review invalidated the earlier `e9b10e392e2fd6ce410798dc4873246c33f438a9` candidate: its Render Blueprint supplied a deploy environment rejected by runtime config, its service name did not prove the mobile production origin, and its frozen V1 asset list omitted two tracked files. That SHA is `SUPERSEDED_DO_NOT_DEPLOY`. Intermediate `7c2ab8e110c5a286556f4ea6d89a5ca1e7fe0e51` and `5ef1c1d77708df452a69d9b570dadd20a4c18852` are also superseded because they lack the complete Lighthouse cleanup fixes.

Final code-quality review then invalidated `56107a288c47980ea09ca1429e4b8be5ea3a3231`: the release smoke expected legacy `release` and `ready` response fields, while the canonical V2 health contract exposes `status`, `version`, and `environment`. Real remote smoke would therefore fail even against a healthy matching deployment. Commit `52c20d844e31d451da2c7634243fa97877c6c076` aligns all three health checks to the exact candidate `version`; the release-tool regression suite, two-pass freeze, and exact-SHA candidate build passed after the fix. `56107a2` is `SUPERSEDED_DO_NOT_DEPLOY`.

## Current Release Topology

- `npm run render-build`: verify exact identity, emit runtime packages in dependency order, emit API, build Web, and import the emitted API graph with plain Node.
- `npm run release:v2:predeploy`: verify the same candidate, then migrate PostGIS.
- `npm start`: run the emitted API and same-origin Web/Socket service.
- `/healthz`, `/readyz`, `/versionz`: health, database readiness, exact release.
- `/api/v1`: versioned HTTP contract.
- `/socket.io`: realtime transport.
- `apps/web/dist`: PWA and Capacitor Web assets.
- Render service `bliver`, runtime `DEPLOY_ENV=production`, Capacitor origin `https://bliver.onrender.com`, and Android host `bliver.onrender.com` are one tested production topology.

## Publish Baseline Decision

The immutable, locally verified release candidate is `52c20d844e31d451da2c7634243fa97877c6c076`. The later commit containing this baseline record is evidence-only and is not represented as a deployed release. Only that exact candidate may advance; `e9b10e3`, `7c2ab8e`, `5ef1c1d`, and `56107a2` are explicitly superseded and must not be deployed. A newer SHA requires a new manifest and complete release gate.

Local non-database gates are green, but the release exit gate is incomplete. Publication status remains `BLOCKED`, `v2.0.0` does not exist, and no Render deployment, remote release match, backup/restore, or observation result is claimed.

## External Blockers

- No real Render deployment credentials or deployment result are available.
- No remote `/versionz` exact-SHA result exists.
- No remote observation window or baseline has started.
- Backup and isolated restore have not yet been exercised against a real candidate database.
- Docker Desktop could not start in the clean-room environment. `db:v2:up` could not reach a daemon, migrate could not create the Drizzle schema, and seed received `ECONNREFUSED 127.0.0.1:54329`.
- No live PostGIS readiness, migration/seed, query-plan, or release-performance result is claimed.

Therefore no production publication, remote observation, Phase 7 tag, or `v2.0.0` tag is claimed.
