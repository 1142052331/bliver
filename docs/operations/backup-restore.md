# PostgreSQL Backup and Restore Runbook

Every production migration or V2 promotion requires a restorable Postgres backup. A successful `pg_dump` without a successful isolated restore does not pass the release gate.

The V1 Mongo source has a separate boundary: it is read only by the standalone `tools/legacy-migration` package during the approved offline migration. Its encrypted BSON archive must be restored into an isolated Mongo instance before any PostgreSQL load. The V2 runtime never connects to MongoDB.

## Ownership and evidence policy

The database owner creates the backup and a second operator verifies the restore when possible. Evidence contains only the provider backup ID or encrypted file checksum, source database identifier, tool/Postgres versions, timestamps, aggregate counts, schema/index checks, restore database identifier, and operator roles. Never record connection strings, passwords, row contents, Outbox payloads, messages, media URLs, or coordinates.

## Create the backup

Prefer the managed Postgres snapshot. For a logical backup, use PostgreSQL 16 client tools and a secured local path:

```powershell
$env:BACKUP_FILE = Read-Host 'Encrypted backup file path'
pg_dump --format=custom --no-owner --no-privileges --file $env:BACKUP_FILE $env:DATABASE_URL
Get-FileHash -Algorithm SHA256 $env:BACKUP_FILE
pg_restore --list $env:BACKUP_FILE | Out-Null
```

Restrict file access and move the dump to encrypted storage under the retention policy. Do not commit the dump or checksum evidence containing a filesystem path tied to a person.

## Restore rehearsal

Provision a new non-production Postgres 16 database with PostGIS. Set `RESTORE_DATABASE_URL` without printing it.

```powershell
pg_restore --clean --if-exists --no-owner --no-privileges --dbname $env:RESTORE_DATABASE_URL $env:BACKUP_FILE
$env:DATABASE_URL = $env:RESTORE_DATABASE_URL
npm.cmd run db:v2:migrate
```

Running the migration command after restore must be idempotent and successful. It is not permission to apply new, unreviewed migration files.

## Verify the restored database

Using `psql` or the provider console, verify without selecting private columns:

```sql
SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto') ORDER BY extname;
SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'platform') ORDER BY 1, 2;
SELECT count(*) AS pending_outbox FROM platform.outbox_events WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
SELECT count(*) AS dead_lettered_outbox FROM platform.outbox_events WHERE dead_lettered_at IS NOT NULL;
```

Compare approved aggregate row counts for identity, footprints, conversations, notifications, moderation/audit, and Outbox tables. Run representative authorized application reads and the PostGIS map `EXPLAIN` gate against the restore. Do not include returned records or query parameters in evidence.

## Pass and failure handling

Pass only when the dump/list operation, isolated restore, idempotent migration, extensions, schema, aggregate counts, indexes, readiness, and authorized reads all match the source expectations. On failure, preserve the dump and restore database, revoke application access to the failed restore, record the failing step and owner, and create a new backup after correcting the cause. Never treat an untested provider snapshot as rollback evidence.
