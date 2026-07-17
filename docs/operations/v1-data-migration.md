# V1 Data Migration Operations

V1 is already offline and has no active writers. This procedure is a one-shot offline migration; it does not use dual-write, CDC, incrementals or a Mongo runtime path.

## Phase A fixture gate

Run from the repository root with Node 24:

```powershell
npm.cmd --prefix tools/legacy-migration ci
npm.cmd --prefix tools/legacy-migration run typecheck
npm.cmd --prefix tools/legacy-migration test
npm.cmd --prefix tools/legacy-migration run preflight -- --fixture fixtures/v1-complete.json --dry-run
```

The fixture gate must report all 15 V1 model collections, zero blocked records and deterministic UUIDv7/digest results. Mongo drivers are allowed only under `tools/legacy-migration`; the root Render candidate does not package this tool.

## Phase B source gate

Load secrets only from an ignored `.env.legacy-migration.local`. The source must be a read-only Mongo connection or a restorable BSON snapshot with an explicit database name. A URI default database is not accepted. `ECONNREFUSED`, authentication failure, an unknown database name, an unexpected collection or any source write is a hard stop.

Create a full encrypted archive before reading records. The archive must cover all 15 V1 collections and any extra collections, include index/count evidence, and restore successfully into an isolated Mongo instance. Keep the archive and migration ledger encrypted; never put a URI, password, hash, endpoint, message, coordinate or ObjectId in Git or public evidence.

## Target and load gates

Create a new PostgreSQL 16/PostGIS database, apply the existing ten V2 migrations and foundation seed, and verify the approved production-equivalent baseline. The target must be an empty PostgreSQL database apart from migration metadata and the foundation marker; business tables must be empty before the load. Run the migration tool against the restored read-only Mongo copy:

```powershell
npm.cmd --prefix tools/legacy-migration run preflight -- --source restored-mongo --config .env.legacy-migration.local --dry-run
npm.cmd --prefix tools/legacy-migration run migrate -- --source restored-mongo --config .env.legacy-migration.local --archive .migration/v1-full.archive.gz.age
npm.cmd --prefix tools/legacy-migration run verify-target -- --config .env.legacy-migration.local --ledger .migration/migration-ledger.json.age
```

The load is one serializable transaction. It writes only current V2 formal tables and never appends Outbox, Socket, push, audit, delivery-attempt or processed-event history. Any conflict, digest mismatch, invalid media, VAPID mismatch, orphan, invalid username or malformed bcrypt hash aborts the run. On failure, destroy the new target database and rerun from the same verified archive; do not patch a dirty target or write to Mongo.

## Release and observation

Run the exact code candidate's full V2 tests, PostgreSQL integration tests with a real isolated database, `npm run render-build`, production-equivalent parity, backup restore rehearsal and authorized API/Socket/media/privacy smoke. Deploy only the recorded exact-SHA candidate, keep V1 down, verify `/healthz`, `/readyz` and `/versionz`, and observe for 60 minutes. A readiness loss, privacy failure, SHA mismatch, sustained error/latency regression or undrained Outbox is a rollback stop.

After the observation window, revoke temporary Mongo, archive, Cloudinary metadata and target-loader credentials. Store only redacted aggregate evidence and encrypted backups under the approved retention policy.
