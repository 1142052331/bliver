# V1 Data Preservation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a one-shot, offline, deterministic migration that preserves the complete V1 Mongo database in a verified encrypted archive, restores only current V2 feature data into a fresh PostgreSQL database, and lets legacy users log in with their existing bcrypt passwords before an atomic Argon2id upgrade.

**Architecture:** A standalone `tools/legacy-migration` package owns Mongo/BSON parsing, source validation, Cloudinary inventory, deterministic transformation, encrypted evidence and PostgreSQL loading. It has its own package lock and is excluded from the root runtime dependency graph; `apps/api` never imports it. The only V2 runtime change remains inside identity: recognize bcrypt, verify it, CAS-upgrade the credential to Argon2id, then issue the normal V2 session. Historical import writes existing tables in one serializable transaction without Outbox, Socket, push or audit side effects.

**Tech Stack:** Node.js 24.16, TypeScript 6 strict mode, Vitest 4, MongoDB Node driver 7 in the standalone tool only, PostgreSQL `pg`, PostGIS 3.6, UUIDv5, Zod, bcryptjs, Argon2id, Cloudinary Admin API, Mongo Database Tools, age encryption.

---

## Delivery Phases

- **Phase A — build without a real Mongo connection:** Tasks 1–11 produce the isolated tool, synthetic Extended JSON fixtures, unit/integration tests, identity bcrypt upgrade, architecture guards, operator docs and CI. Every behavior is executable against fixtures and a disposable PostgreSQL database.
- **Phase B — execute only with an authorized source:** Tasks 12–14 require either a reachable read-only V1 Mongo URL with an explicit database name or a restorable encrypted BSON snapshot whose database name is known. Phase B performs the real archive, dry-run, Cloudinary/VAPID verification, fresh-database load, PostgreSQL restore rehearsal and cutover evidence.

Phase B is blocked today because `C:\Users\Administrator\Downloads\bliver.env` previously returned `ECONNREFUSED` and its effective Mongo database name is unconfirmed. Phase A must not wait for that access.

## Locked File Structure

The migration package remains outside root npm workspaces so its Mongo dependency and lockfile cannot enter Render's root-lock release graph.

```text
tools/legacy-migration/
├── package.json                     # isolated commands and dependencies
├── package-lock.json                # isolated reproducible tool dependency graph
├── tsconfig.json                    # strict tool-only TypeScript project
├── vitest.config.ts                 # fixture/unit/integration test scope
├── fixtures/v1-complete.json        # synthetic Extended JSON covering all 15 V1 models
├── src/cli.ts                       # preflight, migrate, verify and archive command routing
├── src/config.ts                    # secret-safe environment validation
├── src/domain/types.ts              # V1 input, V2 row and manifest types
├── src/domain/ids.ts                # fixed UUIDv5 namespace and canonical keys
├── src/domain/preflight.ts          # classification and referential validation
├── src/domain/transform.ts          # orchestration only; no I/O
├── src/domain/identity.ts           # users, credentials and roles
├── src/domain/footprints.ts         # geography, footprints, discovery and media rows
├── src/domain/interactions.ts       # reads, reactions and two-level comments
├── src/domain/social.ts             # friendship history and blocks
├── src/domain/conversations.ts      # conversations, participants, messages and receipts
├── src/domain/notifications.ts      # notifications, push, reports and profile visitors
├── src/domain/digests.ts            # canonical target-table hashes and invariants
├── src/adapters/fixture-source.ts   # Extended JSON fixture source
├── src/adapters/mongo-source.ts     # read-only explicit-database Mongo source
├── src/adapters/cloudinary.ts       # read-only resource metadata verification
├── src/adapters/postgres-target.ts  # empty-target guard and serializable loader
├── src/adapters/archive.ts          # mongodump/age/mongorestore subprocess boundary
├── src/adapters/evidence.ts         # public aggregate report and encrypted ledger
└── src/__tests__/                   # focused tests matching each domain/adapter file
```

Runtime changes are limited to:

```text
apps/api/src/modules/identity/domain/password.ts
apps/api/src/modules/identity/domain/__tests__/password.test.ts
apps/api/src/modules/identity/application/ports.ts
apps/api/src/modules/identity/application/commands.ts
apps/api/src/modules/identity/application/__tests__/commands.test.ts
apps/api/src/modules/identity/application/memory-repositories.ts
apps/api/src/modules/identity/infrastructure/postgres-repositories.ts
apps/api/src/modules/identity/infrastructure/__tests__/postgres.integration.test.ts
apps/api/package.json
package-lock.json
```

Boundary and operational changes are limited to `.gitignore`, `.github/workflows/ci.yml`, `scripts/release/cutover-check.ts`, its test, and new migration-specific operations/QA documents. Do not add Mongo fields, legacy tables, API routes or Socket events.

## Phase A — Tooling and Fixture Verification

### Task 1: Scaffold the isolated migration package and enforce its boundary

**Files:**
- Create: `tools/legacy-migration/package.json`
- Create: `tools/legacy-migration/package-lock.json`
- Create: `tools/legacy-migration/tsconfig.json`
- Create: `tools/legacy-migration/vitest.config.ts`
- Create: `tools/legacy-migration/src/index.ts`
- Modify: `.gitignore`
- Modify: `scripts/release/cutover-check.ts`
- Modify: `scripts/release/cutover-check.test.ts`

- [ ] **Step 1: Write failing cutover boundary tests**

Add cases proving `mongodb` is allowed only in `tools/legacy-migration/package.json`, while root, `apps/**` and `packages/**` still reject it, and proving runtime source cannot import from the tool:

```ts
it('permits mongodb only in the isolated legacy migration tool', async () => {
  await writeJson('tools/legacy-migration/package.json', { dependencies: { mongodb: '7.0.0' } });
  expect(await findCutoverViolations(root)).toEqual([]);
  await writeJson('apps/api/package.json', { dependencies: { mongodb: '7.0.0' } });
  expect(await findCutoverViolations(root)).toContain('apps/api/package.json directly depends on mongodb');
});

it('rejects runtime imports from the migration tool', async () => {
  await writeFile(resolve(root, 'apps/api/src/leak.ts'), "import '../../../tools/legacy-migration/src/index.js';\n");
  expect(await findCutoverViolations(root)).toContain(
    'apps/api/src/leak.ts imports isolated legacy migration tooling',
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run scripts/release/cutover-check.test.ts`

Expected: FAIL because the checker does not yet inspect runtime imports for the isolated tool exception.

- [ ] **Step 3: Implement the standalone package and explicit boundary**

Create a private ESM package with scripts `test`, `typecheck`, `preflight`, `migrate`, `verify-target`, `archive` and exact dependencies installed by:

```powershell
npm install --prefix tools/legacy-migration --save-exact mongodb@7.0.0 pg@8.16.3 uuid@11.1.0 zod@4.1.12
npm install --prefix tools/legacy-migration --save-dev --save-exact @types/node@24.10.1 @types/pg@8.15.5 tsx@4.19.4 typescript@6.0.3 vitest@4.1.6
```

`tsconfig.json` extends `../../tsconfig.base.json`; Vitest includes only `src/**/*.test.ts`. Add `.migration/`, `*.age`, `*.bson`, `*.archive`, `migration-ledger*.json` and `migration-public-report*.json` to `.gitignore`. Extend cutover checking with a normalized import scan that reports exactly `imports isolated legacy migration tooling` for any `apps/**` or `packages/**` source import resolving into `tools/legacy-migration`.

- [ ] **Step 4: Run boundary, tool and release gates**

Run: `npx vitest run scripts/release/cutover-check.test.ts && npm --prefix tools/legacy-migration test && npm --prefix tools/legacy-migration run typecheck && npm run cutover:v2:check`

Expected: all commands exit 0; the tool has zero tests initially, and cutover continues to reject Mongo in runtime packages.

- [ ] **Step 5: Commit the isolated skeleton**

```powershell
git add .gitignore scripts/release/cutover-check.ts scripts/release/cutover-check.test.ts tools/legacy-migration
git commit -m "build: isolate legacy migration tooling"
```

### Task 2: Define safe configuration, deterministic IDs and evidence redaction

**Files:**
- Create: `tools/legacy-migration/src/config.ts`
- Create: `tools/legacy-migration/src/domain/types.ts`
- Create: `tools/legacy-migration/src/domain/ids.ts`
- Create: `tools/legacy-migration/src/adapters/evidence.ts`
- Test: `tools/legacy-migration/src/__tests__/config.test.ts`
- Test: `tools/legacy-migration/src/__tests__/ids.test.ts`
- Test: `tools/legacy-migration/src/__tests__/evidence.test.ts`

- [ ] **Step 1: Write failing configuration and UUID tests**

```ts
expect(loadConfig({ LEGACY_MONGO_URL: 'mongodb://host', LEGACY_MONGO_DATABASE: '' }))
  .toMatchObject({ ok: false, code: 'MONGO_DATABASE_REQUIRED' });
expect(legacyUuid('user', '507F1F77BCF86CD799439011'))
  .toBe('1affe023-1ff6-5815-84fe-1479219eac70');
expect(legacyUuid('footprint', '507f1f77bcf86cd799439012'))
  .toBe('6d3b32ba-ad39-5a10-bba8-b2f5369c6a02');
expect(() => canonicalObjectId('not-an-object-id')).toThrow('INVALID_OBJECT_ID');
```

Evidence tests pass a Mongo URL, password hash, endpoint, ObjectId, private point and message content into the error path, then assert none appears in `JSON.stringify(publicReport)` while the encrypted-ledger payload contains stable error codes and encrypted-only details.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/config.test.ts src/__tests__/ids.test.ts src/__tests__/evidence.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement strict types and deterministic IDs**

Use the fixed namespace and typed classification:

```ts
export const LEGACY_NAMESPACE = '7290d9d2-4307-5ebf-a8fd-57483b403f67';
export type Classification = 'migrated' | 'archived-only' | 'blocked';
export function canonicalObjectId(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(normalized)) throw new MigrationError('INVALID_OBJECT_ID');
  return normalized;
}
export function legacyUuid(entity: string, key: string): string {
  return v5(`${entity}:${key.toLowerCase()}`, LEGACY_NAMESPACE);
}
```

`loadConfig` must accept explicit values for source URL/database, target URL, Cloudinary cloud, VAPID public keys, archive/evidence paths and age recipients. Its returned diagnostic object exposes only booleans/fingerprints, never values. `writeEvidence` writes aggregate JSON publicly and requires an encryption adapter before accepting record-level details.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/config.test.ts src/__tests__/ids.test.ts src/__tests__/evidence.test.ts && npm --prefix tools/legacy-migration run typecheck`

Expected: 3 files pass; UUID vectors match exactly; secret sentinel strings are absent from public output.

- [ ] **Step 5: Commit core contracts**

```powershell
git add tools/legacy-migration/src
git commit -m "feat: define deterministic migration contracts"
```

### Task 3: Build a complete synthetic V1 source and preflight classifier

**Files:**
- Create: `tools/legacy-migration/fixtures/v1-complete.json`
- Create: `tools/legacy-migration/src/adapters/fixture-source.ts`
- Create: `tools/legacy-migration/src/domain/preflight.ts`
- Test: `tools/legacy-migration/src/__tests__/fixture-source.test.ts`
- Test: `tools/legacy-migration/src/__tests__/preflight.test.ts`

- [ ] **Step 1: Write failing inventory and invariant tests**

The fixture must contain named arrays for all 15 models:

```ts
const expected = [
  'AdminBootstrap', 'Announcement', 'AuditLog', 'BackfillDiscoveryWindow', 'Block',
  'Conversation', 'Feedback', 'Footprint', 'FootprintRead', 'Friendship', 'Message',
  'Notification', 'PushSubscription', 'Report', 'User',
];
expect(Object.keys(await source.collections()).sort()).toEqual(expected.sort());
expect(preflight(source).summary).toMatchObject({ source: 31, blocked: 0 });
expect(preflight(orphanCommentFixture).errors).toContainEqual({ code: 'COMMENT_AUTHOR_MISSING', collection: 'Footprint' });
expect(preflight(invalidUsernameFixture).errors).toContainEqual({ code: 'USERNAME_V2_INCOMPATIBLE', collection: 'User' });
```

Include fixtures for archived-only user fields, announcement, feedback, old audit, profile-view notification, comment report, missing visibility, deleted empty comment, duplicate reaction conflict, orphan references, invalid coordinates and malformed bcrypt.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/fixture-source.test.ts src/__tests__/preflight.test.ts`

Expected: FAIL because fixture parsing and preflight do not exist.

- [ ] **Step 3: Implement full classification and fail-closed validation**

Define a `LegacySource` port that returns typed records and collection metadata. Preflight must classify every source record once, prove `source = migrated + archived-only + blocked`, validate every reference before transformation, reject invalid usernames/password hashes/coordinates/relationships, and record archived-only field counts without copying field values into the public report. Missing V1 footprint visibility maps to public and increments `defaultedVisibilityCount`; no other invalid enum receives a default.

- [ ] **Step 4: Run preflight tests and mutation cases**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/fixture-source.test.ts src/__tests__/preflight.test.ts`

Expected: PASS; the clean fixture reports zero blocked records and every corrupt fixture reports its exact stable code.

- [ ] **Step 5: Commit fixture and preflight**

```powershell
git add tools/legacy-migration/fixtures tools/legacy-migration/src/adapters/fixture-source.ts tools/legacy-migration/src/domain/preflight.ts tools/legacy-migration/src/__tests__
git commit -m "test: model complete legacy migration preflight"
```

### Task 4: Add legacy bcrypt verification and CAS Argon2id upgrade inside identity

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/modules/identity/domain/password.ts`
- Modify: `apps/api/src/modules/identity/domain/__tests__/password.test.ts`
- Modify: `apps/api/src/modules/identity/application/ports.ts`
- Modify: `apps/api/src/modules/identity/application/commands.ts`
- Modify: `apps/api/src/modules/identity/application/memory-repositories.ts`
- Modify: `apps/api/src/modules/identity/application/__tests__/commands.test.ts`
- Modify: `apps/api/src/modules/identity/infrastructure/postgres-repositories.ts`
- Modify: `apps/api/src/modules/identity/infrastructure/__tests__/postgres.integration.test.ts`

- [ ] **Step 1: Install bcryptjs in the API runtime**

Run: `npm install --workspace @bliver/api --save-exact bcryptjs@3.0.2`

Expected: `apps/api/package.json` and the root lock change; no Mongo dependency appears in root `npm ls`.

- [ ] **Step 2: Write failing password-domain tests**

```ts
const legacy = await bcrypt.hash('old-pass', 10);
expect(await verifyPassword(legacy, 'old-pass')).toEqual({ valid: true, needsRehash: true });
expect(await verifyPassword(legacy, 'wrong')).toEqual({ valid: false, needsRehash: false });
expect((await verifyPassword(await hashPassword('password-123'), 'password-123')).needsRehash).toBe(false);
expect(await hashVerifiedLegacyPassword('short')).toMatch(/^\$argon2id\$/);
```

Also assert bcrypt costs outside the approved 8–14 range return invalid and do not execute an unbounded comparison.

- [ ] **Step 3: Run password tests and verify RED**

Run: `npx vitest run apps/api/src/modules/identity/domain/__tests__/password.test.ts`

Expected: FAIL because `verifyPassword` returns boolean and bcrypt is unsupported.

- [ ] **Step 4: Implement algorithm-aware verification without changing registration policy**

Return `PasswordVerification { valid; needsRehash }`, keep `hashPassword` enforcing 8 characters, and add `hashVerifiedLegacyPassword` that skips only the new-registration length check after successful bcrypt proof. Catch malformed hashes generically and never expose algorithm errors.

- [ ] **Step 5: Write failing CAS login tests**

Extend `CredentialRepository` with:

```ts
replaceHash(userId: UserId, expectedHash: string, replacementHash: string): Promise<boolean>;
```

Test a bcrypt login upgrades before session creation, wrong passwords create no session, a CAS loser rereads and verifies the winner's Argon2id hash, a database error creates no session, and two concurrent logins leave one Argon2id credential.

- [ ] **Step 6: Run command tests and verify RED**

Run: `npx vitest run apps/api/src/modules/identity/application/__tests__/commands.test.ts`

Expected: FAIL because repositories lack `replaceHash` and authentication does not upgrade.

- [ ] **Step 7: Implement CAS in memory and PostgreSQL repositories**

PostgreSQL must execute:

```sql
UPDATE identity_credentials
SET password_hash = $3, updated_at = now()
WHERE user_id = $1 AND password_hash = $2
```

Return `rowCount === 1`. In `authenticateUser`, issue devices/sessions only after successful CAS or after rereading and verifying the concurrently upgraded Argon2id credential.

- [ ] **Step 8: Run identity unit and PostgreSQL integration tests**

Run:

```powershell
npx vitest run apps/api/src/modules/identity
$env:RUN_DB_INTEGRATION='1'
npx vitest run apps/api/src/modules/identity/infrastructure/__tests__/postgres.integration.test.ts
```

Expected: all identity tests pass; integration proves exactly one conditional update; zero tests are skipped when the database flag is set.

- [ ] **Step 9: Run boundary checks and commit**

Run: `npm run typecheck:v2 && npm run architecture:check && npm run cutover:v2:check`

Expected: exit 0; identity imports bcryptjs but no Mongo/tool code.

```powershell
git add apps/api/package.json package-lock.json apps/api/src/modules/identity
git commit -m "feat: upgrade legacy bcrypt credentials on login"
```

### Task 5: Transform identity, geography, footprints and verified media

**Files:**
- Create: `tools/legacy-migration/src/domain/identity.ts`
- Create: `tools/legacy-migration/src/domain/footprints.ts`
- Create: `tools/legacy-migration/src/adapters/cloudinary.ts`
- Test: `tools/legacy-migration/src/__tests__/identity-transform.test.ts`
- Test: `tools/legacy-migration/src/__tests__/footprints-transform.test.ts`
- Test: `tools/legacy-migration/src/__tests__/cloudinary.test.ts`

- [ ] **Step 1: Write failing deterministic row tests**

Assert exact user UUID, unchanged username/hash, both `user` and `admin` role rows for an admin, `ST_MakePoint(lng,lat)` parameter ordering, `realLocation` fallback, public fallback only for missing visibility, deterministic region/place/media UUIDs, one discovery row per footprint, and no row for archived-only profile fields.

```ts
expect(result.users[0]).toMatchObject({
  id: '1affe023-1ff6-5815-84fe-1479219eac70',
  username: 'legacy_user', displayName: 'legacy_user',
});
expect(result.footprints[0].privatePoint).toEqual({ lat: 31.2304, lng: 121.4737 });
expect(result.discovery[0].footprintId).toBe(result.footprints[0].id);
expect(result.outbox).toEqual([]);
```

- [ ] **Step 2: Run transform tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/identity-transform.test.ts src/__tests__/footprints-transform.test.ts src/__tests__/cloudinary.test.ts`

Expected: FAIL because transformation modules do not exist.

- [ ] **Step 3: Implement pure transformations and a read-only media port**

`transformIdentity` returns rows only. `transformFootprints` accepts a `VerifiedMedia` map prepared before the database transaction and never calls Cloudinary. The adapter parses URLs, rejects cloud mismatch/non-image/missing bytes or dimensions, and returns `{ publicId, mimeType, bytes, version, width, height, format }`; its interface exposes no delete/upload method.

- [ ] **Step 4: Run tests and verify media failures block the run**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/identity-transform.test.ts src/__tests__/footprints-transform.test.ts src/__tests__/cloudinary.test.ts`

Expected: PASS; each invalid nonempty photo produces `MEDIA_*` blocked status and no placeholder row.

- [ ] **Step 5: Commit core content mapping**

```powershell
git add tools/legacy-migration/src/domain/identity.ts tools/legacy-migration/src/domain/footprints.ts tools/legacy-migration/src/adapters/cloudinary.ts tools/legacy-migration/src/__tests__
git commit -m "feat: map legacy identity footprints and media"
```

### Task 6: Transform reads, reactions, comments, friendships and blocks

**Files:**
- Create: `tools/legacy-migration/src/domain/interactions.ts`
- Create: `tools/legacy-migration/src/domain/social.ts`
- Test: `tools/legacy-migration/src/__tests__/interactions-transform.test.ts`
- Test: `tools/legacy-migration/src/__tests__/social-transform.test.ts`

- [ ] **Step 1: Write failing interaction tests**

Cover FootprintRead timestamps, one reaction per user/footprint, exact duplicate collapse count, conflicting duplicate rejection, deleted empty comment tombstone, top-level parent mapping, direct reply metadata exclusion, orphan author, missing parent, cross-footprint parent and depth greater than two.

```ts
expect(rows.comments.find((row) => row.deletedAt)?.content).toBe('[deleted]');
expect(rows.comments.find((row) => row.sourceId === replyId)?.parentCommentId).toBe(rootUuid);
expect(rows.comments.every((row) => !('replyToUser' in row))).toBe(true);
```

- [ ] **Step 2: Write failing social tests**

Assert low/high UUID ordering, requester/addressee preservation, deterministic initial history with `fromStatus=null`, accepted/pending mapping, block timestamps, and failure on duplicate unordered friendship, self relation or orphan user.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/interactions-transform.test.ts src/__tests__/social-transform.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement pure interaction and social mappings**

Functions accept only preflight-approved records and an immutable ID map. They return formal V2 rows plus aggregate decisions; they never emit events or call repositories. Compare low/high UUIDs lexically in canonical lowercase form, matching PostgreSQL UUID ordering used by constraints.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/interactions-transform.test.ts src/__tests__/social-transform.test.ts`

Expected: PASS with no snapshot updates.

```powershell
git add tools/legacy-migration/src/domain/interactions.ts tools/legacy-migration/src/domain/social.ts tools/legacy-migration/src/__tests__
git commit -m "feat: map legacy interactions and social graph"
```

### Task 7: Transform conversations, messages and receipts

**Files:**
- Create: `tools/legacy-migration/src/domain/conversations.ts`
- Test: `tools/legacy-migration/src/__tests__/conversations-transform.test.ts`

- [ ] **Step 1: Write failing conversation tests**

Assert `greeting_pending -> requested`, `unlocked -> active`, pending sender initiator fallback, participant hidden timestamps, `text -> message`, deterministic message/event IDs, `moderation_status=clear`, empty labels, receiver receipt only when read, and conversation updated time equals the maximum source timestamp.

Test a message with null conversation ID attaches to the unique sender/receiver pair; a missing pair derives one requested conversation for greeting or active for text. Reject mismatched participants, duplicate pairs and ambiguous references.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/conversations-transform.test.ts`

Expected: FAIL because `transformConversations` does not exist.

- [ ] **Step 3: Implement deterministic conversation aggregation**

Use an unordered pair key built from mapped lowercase UUIDs. Produce exactly two participant rows per conversation. Use `updatedAt ?? createdAt` for read receipt time and never import preview, V1 pairKey or pending-sender cache columns.

- [ ] **Step 4: Run the test and commit**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/conversations-transform.test.ts`

Expected: PASS; repeated transformation of reversed input arrays produces byte-identical sorted rows.

```powershell
git add tools/legacy-migration/src/domain/conversations.ts tools/legacy-migration/src/__tests__/conversations-transform.test.ts
git commit -m "feat: map legacy conversations and receipts"
```

### Task 8: Transform notifications, push subscriptions, reports and profile visitors

**Files:**
- Create: `tools/legacy-migration/src/domain/notifications.ts`
- Test: `tools/legacy-migration/src/__tests__/notifications-transform.test.ts`

- [ ] **Step 1: Write failing notification and governance tests**

Assert only reaction/comment notifications migrate, read boolean maps to `createdAt` or null, target is footprint, payload contains only reference, source text/name is absent, and `profile_view` is archived-only. Assert push rows require matching SHA-256 public-key fingerprints and set only `push=true` over current defaults.

Assert footprint reports map status as `pending/open`, `actioned/resolved`, `dismissed/dismissed`, while comment reports remain archive-only. Assert visitor rows aggregate by pair using max timestamp/count, include self-visits, and reject orphan visitors.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/notifications-transform.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement mappings without fabricated governance history**

Return rows only for `notifications`, `notification_preferences`, `push_subscriptions`, `reports` and `profile_visitors`. Explicitly return empty arrays for delivery attempts, moderation cases/actions, audit logs, memory highlights, sessions/devices/security events and processed events; do not expose methods that can append Outbox.

- [ ] **Step 4: Run tests and commit**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/notifications-transform.test.ts`

Expected: PASS; mismatched VAPID fingerprints return `VAPID_KEY_MISMATCH` and block the whole migration.

```powershell
git add tools/legacy-migration/src/domain/notifications.ts tools/legacy-migration/src/__tests__/notifications-transform.test.ts
git commit -m "feat: map legacy notifications and governance data"
```

### Task 9: Load only an empty PostgreSQL target in one serializable transaction

**Files:**
- Create: `tools/legacy-migration/src/domain/transform.ts`
- Create: `tools/legacy-migration/src/domain/digests.ts`
- Create: `tools/legacy-migration/src/adapters/postgres-target.ts`
- Test: `tools/legacy-migration/src/__tests__/transform.test.ts`
- Test: `tools/legacy-migration/src/__tests__/digests.test.ts`
- Test: `tools/legacy-migration/src/__tests__/postgres-target.integration.test.ts`

- [ ] **Step 1: Write failing orchestration and digest tests**

Assert transformations are input-order independent, every source record has exactly one classification, table rows are sorted by primary key, JSON keys and UTC timestamps canonicalize identically, and geography hashes use stable EWKB hex.

- [ ] **Step 2: Write failing PostgreSQL integration tests**

Against a migrated disposable PostGIS database, assert the loader rejects a target with any business row, accepts only the foundation marker/migration metadata, executes `BEGIN ISOLATION LEVEL SERIALIZABLE`, inserts in the documented dependency order, validates before commit and rolls back every row after an injected failure. Assert `platform.outbox_events`, `delivery_attempts`, `audit_logs` and `platform.processed_events` remain zero.

- [ ] **Step 3: Run tests and verify RED**

Run: `$env:RUN_DB_INTEGRATION='1'; npm --prefix tools/legacy-migration test -- --run src/__tests__/transform.test.ts src/__tests__/digests.test.ts src/__tests__/postgres-target.integration.test.ts`

Expected: FAIL because orchestration, digests and loader do not exist.

- [ ] **Step 4: Implement parameterized inserts and pre-commit verification**

Expose one entry point:

```ts
export async function loadMigration(
  target: PostgresTarget,
  plan: MigrationPlan,
): Promise<TargetVerification>;
```

Do not use `ON CONFLICT DO NOTHING` for business rows. Before commit, query FK/unique/check invariants, table counts and hashes and compare them with the dry-run expectation. The adapter accepts `TARGET_DATABASE_URL` only through config and never prints connection metadata.

- [ ] **Step 5: Run unit and integration tests**

Run:

```powershell
npm --prefix tools/legacy-migration test
$env:RUN_DB_INTEGRATION='1'
npm --prefix tools/legacy-migration test -- --run src/__tests__/postgres-target.integration.test.ts
```

Expected: all tool tests pass; database integration reports zero skipped and proves rollback.

- [ ] **Step 6: Commit loader and verification**

```powershell
git add tools/legacy-migration/src/domain/transform.ts tools/legacy-migration/src/domain/digests.ts tools/legacy-migration/src/adapters/postgres-target.ts tools/legacy-migration/src/__tests__
git commit -m "feat: load legacy data transactionally"
```

### Task 10: Add explicit-database Mongo, encrypted archive and CLI adapters

**Files:**
- Create: `tools/legacy-migration/src/adapters/mongo-source.ts`
- Create: `tools/legacy-migration/src/adapters/archive.ts`
- Create: `tools/legacy-migration/src/cli.ts`
- Test: `tools/legacy-migration/src/__tests__/mongo-source.test.ts`
- Test: `tools/legacy-migration/src/__tests__/archive.test.ts`
- Test: `tools/legacy-migration/src/__tests__/cli.test.ts`

- [ ] **Step 1: Write failing Mongo adapter tests**

Mock the driver port and assert no call is made unless `LEGACY_MONGO_DATABASE` is nonempty; `client.db(databaseName)` receives the exact explicit name; `readPreference=secondaryPreferred` and read-only operations are used; collection metadata/count/index digests cover all discovered collections, including extras.

- [ ] **Step 2: Write failing archive subprocess tests**

Use a fake process runner and assert argument arrays, not shell strings:

```ts
expect(calls).toEqual([
  ['mongodump', ['--config', protectedMongoConfig, '--db', database, '--archive', '--gzip']],
  ['age', ['--recipient-file', recipientFile, '--output', encryptedArchive]],
]);
```

The real implementation must pass the URI through a protected temporary config/file descriptor, stream dump stdout into age stdin, hide windows, reject nonzero exit codes and never persist plaintext. Restore streams `age --decrypt` into `mongorestore --archive --gzip --drop` on an isolated destination.

- [ ] **Step 3: Write failing CLI tests**

Assert `preflight --fixture` works without Mongo, `preflight --source mongo` requires URL plus explicit database, `migrate` refuses unless archive restore evidence and zero blocked records exist, and `--dry-run` cannot write PostgreSQL. Assert stderr/stdout contain no sentinel secrets.

- [ ] **Step 4: Run tests and verify RED**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/mongo-source.test.ts src/__tests__/archive.test.ts src/__tests__/cli.test.ts`

Expected: FAIL because adapters and CLI do not exist.

- [ ] **Step 5: Implement fail-closed adapters and command routing**

Commands are `archive`, `verify-archive`, `preflight`, `migrate`, and `verify-target`. Each emits one public aggregate report and one encrypted ledger bound to run ID, archive hash and `RELEASE_SHA`. No command accepts secrets as positional/flag values.

- [ ] **Step 6: Run CLI, archive and secret-redaction tests**

Run: `npm --prefix tools/legacy-migration test -- --run src/__tests__/mongo-source.test.ts src/__tests__/archive.test.ts src/__tests__/cli.test.ts`

Expected: PASS; fixture dry-run exits 0, source mode without a database exits nonzero with `MONGO_DATABASE_REQUIRED`.

- [ ] **Step 7: Commit external adapters**

```powershell
git add tools/legacy-migration/src/adapters/mongo-source.ts tools/legacy-migration/src/adapters/archive.ts tools/legacy-migration/src/cli.ts tools/legacy-migration/src/__tests__
git commit -m "feat: add secure legacy migration commands"
```

### Task 11: Complete Phase A acceptance, CI and operator documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/v1-data-migration.md`
- Create: `docs/qa/v1-data-migration.md`
- Modify: `docs/operations/backup-restore.md`
- Test: `scripts/__tests__/documentation.test.ts`

- [ ] **Step 1: Write failing documentation and CI assertions**

Assert CI has a separate `legacy-migration-tool` job using `tools/legacy-migration/package-lock.json`, runs `npm ci`, typecheck and tests with `working-directory: tools/legacy-migration`, and does not modify the root release job. Assert the runbook contains explicit database-name, read-only/no-write, encrypted restore, empty-target, no-side-effects, destroy-and-retry and exact-SHA gates.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run scripts/__tests__/documentation.test.ts scripts/release/deployment-cutover.test.ts`

Expected: FAIL because migration CI/docs are absent.

- [ ] **Step 3: Add CI and executable operations commands**

Document environment loading only from ignored `.env.legacy-migration.local`, Phase A fixture commands, Phase B commands from Tasks 12–14, safe report locations, credential revocation and stop conditions. `docs/qa/v1-data-migration.md` starts with Phase A evidence and marks Phase B `BLOCKED_SOURCE_ACCESS`, naming `ECONNREFUSED` and unconfirmed database name without connection details.

- [ ] **Step 4: Run the complete Phase A gate**

Run:

```powershell
npm --prefix tools/legacy-migration ci
npm --prefix tools/legacy-migration run typecheck
npm --prefix tools/legacy-migration test
npm --prefix tools/legacy-migration run preflight -- --fixture fixtures/v1-complete.json --dry-run
npm run verify:v2-foundation
npm run cutover:v2:check
npm run render-build
git diff --check
```

Expected: every command exits 0; fixture report has 15 known collections, zero blocked records, deterministic counts/hashes and no secrets; full V2 tests pass with no new skips; Render artifacts contain no migration tool or Mongo driver.

- [ ] **Step 5: Commit Phase A evidence and docs**

```powershell
git add .github/workflows/ci.yml docs/operations/v1-data-migration.md docs/operations/backup-restore.md docs/qa/v1-data-migration.md scripts/__tests__/documentation.test.ts
git commit -m "docs: gate offline legacy data migration"
```

- [ ] **Step 6: Freeze the Phase A migration candidate**

Run: `git status --short && git rev-parse HEAD && npm run release:v2:freeze`

Expected: clean worktree; record the 40-character code candidate SHA in the ignored encrypted ledger and QA document. Later evidence-only commits are not deployable candidate SHAs.

## Phase B — Authorized Real Migration

### Task 12: Prove source identity, no writes and restorable encrypted BSON

**Prerequisites:** A reachable read-only Mongo source with explicit `LEGACY_MONGO_DATABASE`, or an authorized BSON snapshot with its database name; two age recipients; isolated restore Mongo; Mongo Database Tools installed.

**Files:**
- Modify: `docs/qa/v1-data-migration.md` with redacted aggregate evidence only
- Never commit: `.env.legacy-migration.local`, `.migration/**`, `*.age`, ledgers, URLs or secrets

- [ ] **Step 1: Validate source configuration without printing it**

Run: `npm --prefix tools/legacy-migration run preflight -- --source mongo --config .env.legacy-migration.local --connection-only`

Expected: `SOURCE_CONNECTION_PASS`, explicit database-name fingerprint, read-only capability and zero secret values. `ECONNREFUSED`, authentication failure or implicit/default database stops the task.

- [ ] **Step 2: Confirm V1 remains down and source has no writes**

Check Render has no V1 process/worker/cron using the Mongo credential, revoke the V1 write credential, then observe provider operation metrics for 15 minutes.

Expected: zero inserts, updates and deletes during the window. Record only time range and aggregate operation counts.

- [ ] **Step 3: Create the full encrypted archive**

Run: `npm --prefix tools/legacy-migration run archive -- --config .env.legacy-migration.local --output .migration/v1-full.archive.gz.age`

Expected: archive command exits 0; report lists all 15 expected model collections plus any extras, count/index summaries, encrypted size, SHA-256 and two recipient fingerprints; no plaintext archive remains.

- [ ] **Step 4: Restore into an isolated Mongo and verify**

Run: `npm --prefix tools/legacy-migration run verify-archive -- --config .env.legacy-migration.local --archive .migration/v1-full.archive.gz.age`

Expected: `ARCHIVE_RESTORE_PASS`; collection counts, index digests and canonical BSON digests match source; isolated restore has no application/public access.

- [ ] **Step 5: Run real-source dry-run and resolve only code defects**

Run: `npm --prefix tools/legacy-migration run preflight -- --source restored-mongo --config .env.legacy-migration.local --dry-run`

Expected: `blocked=0`, classification equation holds for each collection, usernames and bcrypt hashes are compatible, relationships are complete. Any source semantic incompatibility stops migration and requires a separately approved identity/data policy; do not edit Mongo.

- [ ] **Step 6: Record redacted source evidence**

Update `docs/qa/v1-data-migration.md` with run ID, archive hash, collection/table aggregate counts, restore result and candidate SHA. Run `rg -n "mongodb(?:\+srv)?://|postgres(?:ql)?://|\$2[aby]\$|push_endpoint|507f" docs/qa/v1-data-migration.md`.

Expected: no matches. Do not commit yet; Task 14 commits the complete redacted Phase B evidence once all gates pass.

### Task 13: Verify external assets and load a fresh production-equivalent PostgreSQL

**Prerequisites:** Task 12 passed; read-only Cloudinary metadata credential; V1 and V2 VAPID public keys available through ignored config; a new isolated PostgreSQL 16/PostGIS database.

**Files:**
- Modify: `docs/qa/v1-data-migration.md` with redacted aggregate evidence only

- [ ] **Step 1: Verify Cloudinary and VAPID without mutation**

Run: `npm --prefix tools/legacy-migration run preflight -- --source restored-mongo --config .env.legacy-migration.local --verify-media --verify-vapid --dry-run`

Expected: every nonempty photo resolves to the same cloud with required image metadata; VAPID public-key SHA-256 fingerprints match; zero upload/delete/push actions. Any mismatch blocks the run.

- [ ] **Step 2: Migrate and seed the brand-new target schema**

Run:

```powershell
$env:ENV_FILE='.env.legacy-migration.local'
npm run db:v2:migrate
npm run db:v2:seed
```

Expected: all ten ordered migrations and foundation seed pass; production-equivalent parity matches the approved baseline; business-table empty-target guard passes.

- [ ] **Step 3: Execute the one-shot serializable load**

Run: `npm --prefix tools/legacy-migration run migrate -- --source restored-mongo --config .env.legacy-migration.local --archive .migration/v1-full.archive.gz.age`

Expected: one transaction commits; source/migrated/archive-only counts reconcile; expected and actual table digests match; zero blocked records and zero conflict skips; Outbox/delivery/audit/processed-event counts do not increase.

- [ ] **Step 4: Verify the target independently**

Run: `npm --prefix tools/legacy-migration run verify-target -- --config .env.legacy-migration.local --ledger .migration/migration-ledger.json.age`

Run:

```powershell
$env:ENV_FILE='.env.legacy-migration.local'
npm run db:v2:parity -- --compare artifacts/release/database-parity-baseline.json --require-production-equivalent --write .migration/database-parity-result.json
```

Expected: FK/check/unique/spatial invariants, counts and per-table hashes pass; production-equivalent parity passes; no source IDs or secrets appear in public output.

- [ ] **Step 5: Run exact-SHA offline application acceptance**

Start the Phase A code candidate against the isolated migrated target, then run identity bcrypt fixture upgrade, API/Socket smoke, privacy matrix, map/detail/media, interaction, friend/block, conversation/read, notification/push-subscription read, report and visitor checks.

Expected: all representative reads pass; wrong password creates no session; old JWT is rejected; no historical push/Socket/Outbox emission occurs. Run `npm run test:v2`, PostgreSQL integration with `RUN_DB_INTEGRATION=1`, `npm run render-build` and `npm run release:v2:freeze`; all pass with zero newly skipped tests.

### Task 14: Rehearse PostgreSQL restore, cut over exact SHA and close evidence

**Prerequisites:** Task 13 passed and the migrated database remains isolated/read-only to public traffic.

**Files:**
- Modify: `docs/qa/v1-data-migration.md`

- [ ] **Step 1: Back up and restore migrated PostgreSQL**

Follow `docs/operations/backup-restore.md` using provider snapshot/`pg_dump` and a second isolated PostGIS database. Run all ten migrations again on the restore.

Expected: restore succeeds; migrations are idempotent; extension/schema/index hashes, aggregate counts, canonical data digests, readiness and authorized reads equal the migrated source database.

- [ ] **Step 2: Deploy only the recorded Phase A code candidate**

Set the Render application to the exact 40-character Phase A candidate SHA and the accepted migrated PostgreSQL URL through Render secrets. Do not deploy an evidence-only commit and do not reconnect Mongo.

Expected: `/healthz` and `/readyz` return 200; `/versionz` equals the candidate SHA; V2 runtime environment contains no Mongo URL or V1 JWT secret.

- [ ] **Step 3: Run remote smoke and observe for 60 minutes**

Run `npm run smoke:release` against the deployed origin, then observe request errors/latency, database pool/slow queries, Socket reconnects, Outbox backlog/dead letters, Cloudinary and push provider failures.

Expected: core auth/map/footprint/interaction/social/conversation/notification/media/moderation smoke passes; privacy matrix remains correct; readiness stays 200; Outbox drains; no sustained regression or secret exposure.

- [ ] **Step 4: Revoke temporary migration credentials and preserve encrypted evidence**

Revoke Mongo read, isolated-restore, Cloudinary metadata and target loader credentials. Keep the encrypted BSON archive, encrypted ledger, PostgreSQL backup and restore report under the approved retention policy with two-recipient key custody.

Expected: migration credentials can no longer connect; application credential retains only normal V2 privileges; no plaintext migration artifact exists.

- [ ] **Step 5: Finalize and validate the redacted QA record**

Update `docs/qa/v1-data-migration.md` with PASS/BLOCKED for every gate, candidate SHA, deployment ID, aggregate counts/hashes, archive/restore evidence references and observation window. Run:

```powershell
git diff --check
rg -n "mongodb(?:\+srv)?://|postgres(?:ql)?://|api_secret|private_key|\$2[aby]\$|\$argon2|push_endpoint|p256dh|auth_key" docs/qa/v1-data-migration.md
git status --short
```

Expected: `git diff --check` exits 0; secret scan has no matches; only the QA document is modified.

- [ ] **Step 6: Commit evidence only after every gate passes**

```powershell
git add docs/qa/v1-data-migration.md
git commit -m "docs: record verified V1 data migration"
```

Record this as evidence-only and retain the Phase A code candidate SHA as the deployed release identity.

## Final Completion Gate

The chapter is complete only when Tasks 1–14 pass. Completion requires a verified encrypted full Mongo archive, zero blocked migrated-feature records, deterministic source/target reconciliation, bcrypt-to-Argon2id login proof, production-equivalent PostgreSQL load and restore rehearsal, exact-SHA deployment, 60-minute observation and revoked temporary credentials. Until Phase B prerequisites are available, report Phase A as complete and the chapter as `BLOCKED_SOURCE_ACCESS`; never convert unavailable live evidence or skipped integration into PASS.
