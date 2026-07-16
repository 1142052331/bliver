# V2 Rollback Runbook

Rollback replaces the whole accepted application SHA. Never roll back only the Web shell or API, and never run reverse SQL against ordered migrations.

## Triggers

Rollback for an exact-SHA mismatch, repeated `/readyz` 503, authentication/privacy exposure, destructive moderation error, migration inconsistency, sustained 5xx/latency regression, broken core Socket messaging, or an Outbox backlog that cannot drain during observation.

## Application Rollback

1. Freeze deploys and assign incident/rollback owners.
2. Record timestamps, current and previous SHAs, deploy identifiers, sanitized request/correlation IDs, backup/restore identifiers, and aggregate metrics.
3. Stop the new API and Outbox worker as one service.
4. Redeploy the recorded previous whole-service SHA.
5. Verify `/healthz`, `/readyz`, `/versionz`, `/api/v1` guest/auth behavior, Socket polling, the PWA shell, and a missing asset 404.
6. Confirm `/versionz.version` is exactly the rollback SHA and observe at least 30 minutes.

## Database Decision

Migrations are forward-only. Keep the migrated schema when the previous application is compatible. Otherwise keep the affected database read-only, restore the pre-deploy backup into a new PostGIS database using [backup-restore.md](./backup-restore.md), re-run idempotent migrations, verify extensions/schema/counts/indexes/authorized reads, and repoint the rollback service in one controlled change.

Never overwrite the only database, delete Outbox or audit rows, clear leases manually, or mark failed events processed. Closeout requires readiness, exact release, privacy checks, Outbox convergence, observation duration, unresolved dead-letter count, owners, and follow-up dates.
