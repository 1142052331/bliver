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
- `2857197` qa: record V2 phase 3 map footprint evidence
- `a265eb6` fix: resolve authenticated map viewers
- `24fbe12` qa: record authenticated map viewer fix
- `ea582b9` test: add V2 map Playwright smoke
- `6646a04` fix: harden V2 map browser smoke
- `94cee52` qa: record final map smoke evidence
- `92f8175` test: exclude browser specs from Vitest
- `a6b4b93` qa: record browser test isolation
- `aec6668` qa: clarify phase 3 environment concern
- `05588a0` fix: close Phase 3 persistence and realtime boundaries
- `c733439` test: fixture map and detail API contracts
- `5356337` test: isolate browser session contract
- `d865489` test: cover Phase 3 OpenAPI paths
- `935f7ff` qa: record Phase 3 review remediation
- `b2cfb82` fix: attach uploaded assets to footprint publish
- `6fbc70b` fix: close Phase 3 map footprint review gaps
- `dfa1e84` test: finish Phase 3 acceptance coverage
- `8627e26` qa: update Phase 3 acceptance commit list
- `55b040d` fix: close final Phase 3 review gaps
- `20601bd` fix: harden Phase 3 production boundaries

## Verification

| Command | Result |
| --- | --- |
| `npm.cmd run architecture:check` | PASS; no dependency violations (163 modules, 288 dependencies) |
| `npm.cmd run lint:v2` | PASS |
| `npm.cmd run typecheck:v2` | PASS |
| `npm.cmd run test:v2` | PASS; 41 files passed and 2 environment-gated files skipped; 148 tests passed and 6 skipped |
| `npm.cmd run build:v2` | PASS; API and Web builds complete |
| `npm.cmd --workspace @bliver/contracts run contracts:openapi` | PASS; OpenAPI JSON and TypeScript client regenerated locally from contract sources |
| `npm.cmd run db:v2:migrate` | BLOCKED: `DATABASE_URL is required` |
| `npx.cmd playwright test apps/web/e2e/map-footprints.spec.ts` | PASS; 6 tests across Chromium Pixel 5 and Desktop Chrome projects |

The Web build retains the existing Vite warning that the Leaflet bundle is larger than 500 kB after minification. No credentials, tokens, database URLs, or provider secrets were recorded.

## Focused coverage

- Media adapter/service/routes/Postgres adapter: 15 tests, including signed parameter shape, MIME/size validation, missing configuration, idempotency, ownership, Cloudinary metadata completion, and no long-lived URL.
- Footprint commands: 7 tests, including rejected-provider and bounded-timeout fallback, public discovery expiry defaults, idempotent replay, visibility, and owner deletion.
- Map query: 4 tests, including privacy DTO boundary, stable cursor order, max count, empty viewport, and Postgres cursor/limit pushdown.
- Database transaction port: 2 environment-independent tests covering commit and rollback/rethrow behavior.
- Outbox worker/Postgres adapter: 4 tests, including claim/ack idempotency, retry/dead-letter, availability scheduling, `FOR UPDATE SKIP LOCKED`, and mark SQL.
- Geography provider: dedicated timeout fallback coverage for Nominatim reverse and search calls.
- Web map/publish/detail/realtime/media upload/router: 11 focused tests, including selected-point publish, remote loading/error retry, Search/Locate callbacks, reconnect query invalidation, and Cloudinary completion metadata validation.
- Contract/OpenAPI suite: 8 tests covering the Phase 3 paths, shared discovery/media validation, and wrapped `{ footprint, event }` publish response.
- Footprint REST transport: 2 tests covering the wrapped publish response and UUID media validation.
- Security and recovery boundaries: authenticated owner-room Socket.IO delivery, stale outbox claim lease recovery, Cloudinary signed format/size constraints with authenticated metadata verification, and concurrent media/footprint idempotency winner replay/conflict tests.

## Handoff

Before phase acceptance/tagging, provide a PostGIS `DATABASE_URL` and run `npm.cmd run db:v2:migrate`. The Postgres transaction, media ownership, PostGIS map, and `SKIP LOCKED` outbox adapters compile and are wired into `startServer`, but their integration suites were skipped without that database.

Remaining review concerns:

- Friendship/block persistence belongs to Phase 4 and no relationship tables exist yet. Production denies authenticated non-owner footprint reads until those ports are available; it does not claim friends-only behavior is available in Phase 3.
- The Web publish flow uploads directly to Cloudinary, validates the provider response, reconciles version/dimensions/format through the authenticated media completion endpoint, and then passes the stable asset ID to footprint publish.
- Socket.IO connections require a valid session cookie or handshake token; publication events are emitted only to the authenticated author's room rather than globally.
- Cloudinary upload signatures bind the allowed format and maximum file size, and completion metadata is read back from the authenticated provider resource before persistence.
- Outbox claims can be reclaimed after the configured lease, and Postgres map queries push cursor ordering and bounded limits into SQL.
- Postgres idempotency reservations use a unique-key insert race; losers replay the committed winner response or return a conflict without creating duplicate assets, footprints, or outbox events.
- Browser smoke uses deterministic contract fixtures because the API cannot start without Postgres; it does not prove a live Cloudinary/Postgres publish.
- PostGIS integration suites remain environment-gated. The environment-independent transaction and Outbox SQL tests prove port behavior but are not substitutes for a live Postgres run.
- Nominatim timeout fallback is covered; the production weather port currently returns the documented null fallback and has no live weather provider integration in this phase.
- Publishing requires an explicit selected/current point from map URL or navigation state; a direct publish route without a point rejects submission instead of inventing coordinates.
