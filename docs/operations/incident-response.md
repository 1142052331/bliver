# V2 Incident Response Runbook

This runbook covers the operational failures named by the Phase 7 hardening gate. Privacy, authentication, audit integrity, and destructive moderation failures are severity 1. Sustained unavailability or data-processing failures are severity 2. Isolated optional-provider degradation is severity 3 when core writes and privacy remain correct.

## First response

1. Assign an incident commander, operations owner, database owner, and communications owner.
2. Freeze deploys and record the current `/versionz` release, environment, timestamps, request/correlation IDs, and aggregate metrics.
3. Check `/healthz` and `/readyz`; a DB failure must produce `/readyz` 503 with `DB_UNAVAILABLE`.
4. Compare `requests`, `errors`, latency, `dbPoolFailures`, `slowQueryFailures`, Socket counters, Outbox counters, and external provider failure counters with the pre-release baseline.
5. Do not capture request/response bodies, access or refresh tokens, message content, private coordinates, provider credentials, or Outbox payloads.

Use [rollback.md](./rollback.md) for release-wide or privacy-impacting failures.

## Failure procedures

| Failure | Containment and diagnosis | Recovery and proof |
| --- | --- | --- |
| Outbox backlog/retries | Count pending, claimed, retrying, and dead-letter rows and calculate oldest `available_at`; inspect event type and sanitized `last_error`, never payload. Confirm exactly one worker and DB readiness. | Restore the worker/service and allow lease expiry plus exponential retry to drain. The current code has no guarded dead-letter replay command; do not update rows manually. Escalate dead letters for a reviewed replay tool. Prove backlog age returns below 5 seconds and downstream projections/notifications converge. |
| Socket outage | Verify HTTP readiness, Socket polling, connection/reconnect/auth-failure counters, proxy WebSocket support, and same-origin routing. Preserve HTTP access while disabling repeated deploys. | Restart the whole service/gateway if required. Use two clients to prove reconnect, resync, delivery ordering, block behavior, and session revoke. HTTP health alone is not recovery proof. |
| Cloudinary outage | Confirm `cloudinaryFailures`, provider status, signing/upload errors, and that non-media reads remain healthy. Do not rotate credentials in logs or retry uploads indefinitely. | Disable media publishing if errors are sustained while preserving text-only workflows and existing media records. Restore configuration/provider service, then prove sign/upload/complete and a failed-upload retry without duplicate assets. |
| Geocoder outage | Confirm `geocoderFailures`, timeout/rate status, and safe provider URL. Nominatim calls are bounded to 2 seconds and degrade to null place/region or empty search. | Keep map and coordinate privacy rules active; label place search unavailable and retain retry. Prove publish/map remain safe, search returns after recovery, and no private coordinates enter logs. |
| Push outage | Confirm `pushFailures`, VAPID configuration, provider status, delivery attempt aggregates, and expired subscription rate. In-app notifications remain authoritative. | Allow the bounded three-attempt delivery path; remove only 404/410 expired subscriptions. Restore provider/configuration and prove one delivery without duplicate in-app notifications. |
| Postgres/readiness failure | Stop writes when `/readyz` is 503. Check provider health, pool exhaustion, locks, slow queries, disk, and migration state. | Restore DB health or use the rehearsed restore. Require readiness 200, migration consistency, bounded map query plans, and no audit/Outbox loss before writes resume. |

## Safe Outbox queries

Run aggregate queries only:

```sql
SELECT
  count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS pending,
  count(*) FILTER (WHERE dead_lettered_at IS NOT NULL) AS dead_lettered,
  max(EXTRACT(EPOCH FROM (now() - available_at)) * 1000)
    FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS oldest_lag_ms
FROM platform.outbox_events;
```

Do not select `payload`, bulk-clear `claimed_at`, change `attempts`, or mark events processed during an incident.

## Resolution

Recovery requires the exact release SHA, readiness, representative API and Socket smoke, privacy checks, Outbox convergence, and a 30-minute observation window. Use 60 minutes after database restore/migration or a severity 1 incident. Record the root cause, impact window, aggregate evidence, rollback/degradation decision, follow-up owner, and due date.
