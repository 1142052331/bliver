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

Task 3 initially proved that the inherited TypeScript configuration emitted no API artifact. Candidate verification blocked on the missing server. The dedicated API production build configuration now emits `apps/api/dist/bootstrap/server.js`; a fresh ordered candidate build passed. No migration ran during either build.

Task 4 removed 305 tracked application files plus child locks, data models/config, token middleware, routes/events, backfills, compatibility UI, and old assets. It also removed the old root verifier and temporary inventory implementation after the inventory was committed. The retained `cutover:v2:check` verifies a V2-only runtime and direct dependency graph.

The root lock contains an OpenTelemetry instrumentation package name brought transitively by the required Sentry API integration and Lighthouse toolchain. Direct dependency inspection proves the corresponding database library and removed database/token packages are not installed. This is a third-party lock-name exception, not an application data path.

## Current Release Topology

- `npm run render-build`: verify exact identity, emit API, build Web, verify artifacts.
- `npm run release:v2:predeploy`: verify the same candidate, then migrate PostGIS.
- `npm start`: run the emitted API and same-origin Web/Socket service.
- `/healthz`, `/readyz`, `/versionz`: health, database readiness, exact release.
- `/api/v1`: versioned HTTP contract.
- `/socket.io`: realtime transport.
- `apps/web/dist`: PWA and Capacitor Web assets.

## External Blockers

- No real Render deployment credentials or deployment result are available.
- No remote `/versionz` exact-SHA result exists.
- No remote observation window or baseline has started.
- Backup and isolated restore have not yet been exercised against a real candidate database.
- Clean-room Docker/PostGIS evidence is recorded only after Task 6 runs.

Therefore no production publication, remote observation, Phase 7 tag, or `v2.0.0` tag is claimed.
