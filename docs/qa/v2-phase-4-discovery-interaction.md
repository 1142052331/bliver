# Bliver V2 Phase 4 Discovery and Interaction

## Status

DONE_WITH_CONCERNS. Discovery, privacy-filtered Activity and Map DTO parity, reactions, exactly two-level comments, report intake, shared web conversation UI, and browser acceptance coverage are complete. The migration command could not connect because this worktree has no `DATABASE_URL`; no database result or tag is claimed.

## Commits

- `34eac07` feat: add phase 4 discovery and interactions
- `c442a15` qa: record phase 4 discovery interaction evidence
- `220bc28` fix: accept canonical visibility change events
- `8556371` fix: close phase 4 discovery review gaps
- `f8e4859` fix: share configured discovery cursor secret
- `77fc20d` fix: make comment replay atomic

## Verification

| Command | Result |
| --- | --- |
| `npm.cmd run db:v2:migrate` | BLOCKED; `Database migration failed: DATABASE_URL is required` |
| `npm.cmd run typecheck:v2` | PASS; all seven V2 workspaces |
| `npm.cmd run lint:v2` | PASS; zero warnings/errors |
| `npm.cmd run test:v2` | PASS; 51 files passed, 3 Postgres environment-gated files skipped; 180 tests passed, 7 skipped |
| `npx.cmd playwright test apps/web/e2e/discovery-interaction.spec.ts` | PASS; 8 tests across Pixel 5 and Desktop Chrome, including guest comment login/replay, authenticated session fixtures, and blocked-candidate filtering |
| `npm.cmd run architecture:check` | PASS; no dependency violations (215 modules, 439 dependencies) |
| `npm.cmd run build:v2` | PASS; API and web production builds complete |
| `npm.cmd --workspace @bliver/contracts run contracts:openapi` | PASS; OpenAPI JSON and generated client refreshed locally |

The web build retains the existing Vite warning for a JavaScript chunk larger than 500 kB. Playwright creates `test-results/` during execution; it was removed before commit.

## Acceptance Evidence

- `discovery_entries` is a rebuildable projection consumed idempotently from footprint publish, visibility, and deletion Outbox events. It never writes footprint facts.
- Signed HMAC base64url cursors are length-limited and bind strict `(publishedAt, UUIDv7)` descending boundaries. Candidate SQL includes privacy, block, scope, text, relationship, unread/media, cursor, order, and limit predicates.
- Map and Activity now share the same signed cursor helper; unsigned, tampered, and oversized cursors are rejected before query execution.
- Smart Activity resolves the first non-empty privacy-filtered scope in `region -> country -> global` order. There is no ranking boost; Map and Activity serialize through the same `FootprintVisibilityPolicy.toPublicDto` path.
- Production smart-scope context is derived from the actor's latest regional footprint, with an explicit empty-context fallback to global. Anonymous `relationship=friends` returns an empty page and never falls through to public rows.
- Guest discovery excludes expired public rows. Owner and accepted-friend policy reads retain eligible history, while either-direction blocks exclude rows before pagination and again at the policy boundary.
- Reactions use `(footprint_id, actor_id)` uniqueness and replace emoji in place. Comments use one table plus a database trigger and application validation to allow only top-level comments and one reply level. Comment author or admin may soft-delete.
- Report intake validates a closed reason set, rejects anonymous/blocked actors, enforces one open report per reporter and footprint, and emits `ReportCreated`. Resolution UI and commands are absent by design until Phase 6.
- Activity covers loading, empty, failure/retry, scope labels, cursor controls, guest pending actions, optimistic reactions, comments, replies, and report confirmation. `ConversationSection` is shared by Activity cards and footprint detail surfaces.
- Interaction and report GET/command routes resolve the actor and apply the same footprint policy before reads. Command idempotency uses the existing Postgres `platform.idempotency_keys` table (with an explicit repository port and memory test adapter), and web guest actions navigate to login and replay after authentication.
- Comment and reply idempotency reserves the durable key, comment response, comment row, and `CommentAdded` Outbox event inside one transaction. Unique-key losers load the committed winner; rollback tests prove a crash leaves no reservation or mutation to replay.
- Browser acceptance proves guest discovery/pending auth intent, authenticated reaction/comment/reply/report, and blocked-content absence on mobile and desktop fixtures.

## Environment Limitation

`DATABASE_URL` and `V2_DATABASE_URL` were both unset. The Postgres migration, fixture-scale EXPLAIN assertion, and persistence integration tests therefore did not execute. The migration is journaled as `0006_phase4_discovery_interactions.sql`, which is the next sequence after Phase 3. No Phase 4 tag was created.
