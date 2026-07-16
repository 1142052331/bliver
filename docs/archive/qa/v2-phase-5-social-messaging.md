# Bliver V2 Phase 5 Social and Messaging

## Status

DONE_WITH_CONCERNS. Social graph, block policy, friendships, greeting-limited conversations,
messages, unread/read state, typing presence, reconnect-safe Socket handlers, and the V2 Web
People/Messages experience are implemented. PostgreSQL migration execution remains environment
blocked because this worktree has no `DATABASE_URL`; no database result or tag is claimed.

## Commits

- `21ee84f` feat: add social graph and block policy
- `38358ae` feat: expose social graph commands
- `aabb84f` feat: add conversation state machine
- `02c97f3` feat: persist conversation messages
- `3c9fb1d` feat: add realtime conversation transport
- `4a53f98` feat: add V2 social and messaging experience
- `e07aae7` feat: route V2 social and conversations pages
- `1255b48` test: stabilize phase 5 social messaging acceptance
- `ddc6b30` fix: close phase 5 conversation safety gaps

## Verification

| Command | Result |
| --- | --- |
| `npm.cmd run db:v2:migrate` | BLOCKED; `Database migration failed: DATABASE_URL is required` |
| `npm.cmd run architecture:check` | PASS; no dependency violations (263 modules, 559 dependencies) |
| `npm.cmd run typecheck:v2` | PASS; all V2 workspaces |
| `npm.cmd run lint:v2` | PASS; zero warnings/errors |
| `npx.cmd vitest run --config vitest.config.ts --pool=threads --maxWorkers=1` | PASS; 66 files, 240 tests passed, 7 Postgres-gated tests skipped |
| `npm.cmd run test:v2` | ENVIRONMENT-LIMITED; default fork pool exhausted Windows virtual memory and terminated workers; the single-thread full suite above passed |
| `npm.cmd run build:v2` | PASS; API and Web production builds complete |
| `npx.cmd playwright test apps/web/e2e/social-messaging.spec.ts` | PASS; 4 tests across mobile and desktop |

The Vite build retains the existing chunk-size warning. Playwright `test-results/` was removed
after verification.

## Acceptance Evidence

- Social owns canonical friendship pairs, status history, blocks, relationship summaries, reusable
  block predicates, and friendship/block Outbox events. Commands use session actor identity and
  transaction-scoped idempotency reservations.
- Conversation commands depend on `RelationshipQueryPort` and do not read Social tables. Greeting
  sends are limited to one stranger greeting; replies unlock normal conversation, while friends
  may message directly and blocked users are mutually invisible.
- Migration `0007_social_conversations.sql` contains Social facts and `0008_conversations.sql`
  contains conversations, participants, messages, receipts, and typing presence with unique keys
  and indexes for history/unread/expiry.
- Conversation REST routes validate shared contracts, use cursor history, and route writes through
  application handlers. Socket callbacks only call handler factories; handlers validate payloads,
  enforce authorization, and deliver event IDs for client dedupe/replay.
- Web routes expose `/people`, `/messages`, and `/messages/:conversationId`. People and Messages
  surfaces include relationship actions, greeting/reply, optimistic idempotent sends with retry,
  unread/read and typing state, blocked state, empty/loading/error states, and forced session
  revocation handling.
- Conversation list responses include last message and unread counts derived from receipts; the
  application filters blocked peers through `RelationshipQueryPort` before HTTP serialization.
- Socket conversation commands revalidate the original session token on every command, return an
  `AUTH_REQUIRED` acknowledgement before disconnecting revoked clients, and read receipts emit no
  duplicate Outbox event when the receipt already exists.
- Playwright covers request/accept, greeting/reply, unread state, messaging deep links,
  block/unblock, forced revocation, mobile/desktop layouts, and horizontal-overflow checks.
- Discovery query fixtures use a future normal expiry and an explicit past expiry so guest tests do
  not become wall-clock dependent while still exercising the expiry rule.

## Environment Limitation

`DATABASE_URL` and `V2_DATABASE_URL` were unset. The `0007` and `0008` migrations, live Postgres
repository tests, and database-backed Socket persistence therefore did not execute. The phase is
not tagged until a real Postgres/PostGIS environment runs the migration and integration checks.
