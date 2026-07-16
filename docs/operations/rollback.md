# V2 Rollback Runbook

Rollback restores the whole accepted application SHA. Do not roll back only the web client or only the API, and do not run reverse SQL against the V2 migrations.

## Preconditions

The release checklist must record the previous SHA and deploy identifier, rollback owner, candidate/current database identifier, backup identifier, restore rehearsal identifier, and the observation start time. These are opaque identifiers; do not record database URLs, tokens, message content, media URLs, or coordinates.

## Decision triggers

Rollback immediately for a release SHA mismatch, repeated `/readyz` 503, authentication or private-coordinate exposure, destructive moderation error, migration inconsistency, sustained 5xx/latency regression, Socket failure that breaks core messaging, or Outbox failure that cannot drain within the observation window.

Provider-only failures may remain in degraded mode when the core application is healthy and the procedures in [incident-response.md](./incident-response.md) contain the impact.

## Application rollback

1. Freeze new deployments and assign the incident commander and rollback owner.
2. Record timestamps, affected SHA, request/correlation IDs, and aggregate metrics. Do not capture bodies or secrets.
3. Stop the new service and its Outbox worker as one unit so no second worker races the replacement.
4. Redeploy the recorded previous whole-service SHA.
5. Verify `/healthz`, `/readyz`, `/versionz`, guest map access, authenticated login, and Socket polling. `/versionz.version` must equal the rollback SHA.
6. Observe for at least 30 minutes and record residual Outbox backlog/dead-letter counts.

The current Phase 7 repository has no production V2 Render command. Until Phase 8 replaces V1 deployment wiring, rollback is exercised only in the isolated candidate environment.

## Database decision

Migrations are forward-only. If the previous application is compatible with the migrated schema, leave the schema in place and roll back code only. If incompatible writes or DDL make that unsafe:

1. Keep the affected database read-only and preserve it for investigation.
2. Restore the pre-deploy backup into a new database by following [backup-restore.md](./backup-restore.md).
3. Verify migrations, extensions, aggregate counts, representative authorized reads, and required indexes in the restored database.
4. Repoint the whole rollback service to the restored database in one controlled configuration change.
5. Re-run readiness, release, browser, Socket, and privacy smoke before reopening writes.

Never overwrite the only production database during restore, delete Outbox payloads, clear audit rows, or manually mark failed events processed.

## Closeout evidence

Record the rollback reason, decision time, operator roles, old/new deploy IDs, old/new SHAs, database decision, backup/restore identifiers, smoke results, observation duration, unresolved dead-letter count, and follow-up owner. A rollback is not closed until the incident commander confirms readiness and privacy checks.
