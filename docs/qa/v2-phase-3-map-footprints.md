# Bliver V2 Phase 3 Map and Footprints

## Status

DONE_WITH_CONCERNS. The application, API boundaries, focused tests, and static V2 gates are complete. PostGIS migration and Playwright viewport evidence are environment-blocked in this worktree and are recorded below without fabrication.

## Commits

- `52b4a59` feat: add V2 media upload boundary
- `4df820f` feat: add transactional footprint publishing
- `a4f4f84` feat: add PostGIS map queries
- `b7025ef` feat: publish footprint events reliably
- `6dfbc67` feat: add V2 map and footprint experience
- `fb2b104` test: run V2 map tests in jsdom
- `a265eb6` fix: resolve authenticated map viewers
- `ea582b9` test: add V2 map Playwright smoke

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

Before phase acceptance/tagging, provide a PostGIS `DATABASE_URL` and run `npm.cmd run db:v2:migrate`. The deterministic Playwright smoke covers guest map, an authenticated publish request fixture (including cookie and payload assertions), privacy labels, and deep links at mobile and desktop sizes. Add the API-backed publish fixture when a PostGIS/Cloudinary environment is available.
