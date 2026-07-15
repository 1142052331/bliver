# Bliver V2 Phase 3 Map and Footprints

## Status

DONE_WITH_CONCERNS. The application, API boundaries, focused tests, static V2 gates, and deterministic browser smoke are complete. PostGIS migration remains environment-blocked in this worktree and is recorded below without fabrication.

## Commits

- `52b4a59` feat: add V2 media upload boundary
- `4df820f` feat: add transactional footprint publishing
- `a4f4f84` feat: add PostGIS map queries
- `b7025ef` feat: publish footprint events reliably
- `6dfbc67` feat: add V2 map and footprint experience
- `fb2b104` test: run V2 map tests in jsdom
- `a265eb6` fix: resolve authenticated map viewers
- `ea582b9` test: add V2 map Playwright smoke
- `24fbe12` qa: record authenticated map viewer fix
- `6646a04` fix: harden V2 map browser smoke
- `92f8175` test: exclude browser specs from Vitest
- `05588a0` fix: close Phase 3 persistence and realtime boundaries
- `c733439` test: fixture map and detail API contracts
- `5356337` test: isolate browser session contract
- `d865489` test: cover Phase 3 OpenAPI paths

## Verification

| Command | Result |
| --- | --- |
| `npm.cmd run architecture:check` | PASS; no dependency violations (137 modules, 220 dependencies) |
| `npm.cmd run lint:v2` | PASS |
| `npm.cmd run typecheck:v2` | PASS |
| `npm.cmd run test:v2` | PASS; 29 files, 115 passed, 6 skipped |
| `npm.cmd run build:v2` | PASS; API and Web builds complete |
| `npm.cmd run db:v2:migrate` | BLOCKED: `DATABASE_URL is required` |
| `npx.cmd playwright test apps/web/e2e/map-footprints.spec.ts` | PASS; 6 tests across Chromium Pixel 5 and Desktop Chrome projects |

The Web build retains the existing Vite warning that the Leaflet bundle is larger than 500 kB after minification. No credentials, tokens, database URLs, or provider secrets were recorded.

## Focused coverage

- Media adapter/service/routes: 12 tests, including signed parameter shape, MIME/size validation, missing configuration, idempotency, rate/ownership boundary, and no long-lived URL.
- Footprint commands: 4 tests, including provider fallback, transaction rollback shape, idempotent replay, visibility, and owner deletion.
- Map query: 3 tests, including privacy DTO boundary, stable cursor order, max count, and empty viewport.
- Outbox worker: 3 tests, including claim/ack idempotency, retry/dead-letter, and availability scheduling.
- Web map/publish/detail: 3 tests, plus the existing 9 route/shell tests.

## Handoff

Before phase acceptance/tagging, provide a PostGIS `DATABASE_URL` and run `npm.cmd run db:v2:migrate`. The Postgres transaction, media ownership, PostGIS map, and `SKIP LOCKED` outbox adapters compile and are wired into `startServer`, but their integration suites were skipped without that database.

Remaining review concerns:

- Friendship/block persistence belongs to Phase 4 and no relationship tables exist yet; the Phase 3 server fails closed with injected false relationship ports.
- The Web publish request is authenticated and API-backed, but direct Cloudinary upload completion is not yet attached to the returned stable asset ID when a photo is selected.
- Browser smoke uses deterministic contract fixtures because the API cannot start without Postgres; it does not prove a live Cloudinary/Postgres publish.
- Reconnect invalidation and provider timeout behavior are implemented but have no dedicated browser/integration tests yet.
