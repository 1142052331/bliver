# Bliver eight-phase release runbook

This runbook promotes one immutable Git commit through an isolated Render candidate and then to the combined production Express service. Frontend and backend are always built, deployed, and rolled back together.

## Release invariants

- The candidate and production service must run the same full 40-character Git SHA.
- The candidate must use a different MongoDB database, JWT secret, admin setup secret, VAPID key pair, and Cloudinary folder from production.
- No production write is allowed before candidate acceptance and proof that a production snapshot can be restored.
- Backfill execution has one runner, defaults to dry-run, and has no reverse migration.
- A code or lockfile change after G1 creates a new candidate and restarts G1.
- Evidence must contain IDs, counts, timestamps, statuses, hashes, and redacted log excerpts only. Never record tokens, URIs, content, coordinates, or secret values.

## Operator variables

Set these in the operator shell without committing them. The release checklist records their non-secret identifiers.

```powershell
$env:RELEASE_SHA = git rev-parse HEAD
$env:CANDIDATE_URL = Read-Host 'Candidate base URL'
$env:PRODUCTION_URL = 'https://bliver.onrender.com'
$env:BACKUP_ID = Read-Host 'Provider backup identifier'
```

Do not paste the resulting values into Git, chat, screenshots, or evidence files.

## Gate summary

| Gate | Purpose | Pass condition |
| --- | --- | --- |
| G0 | Freeze | Clean branch and recorded SHA |
| G1 | Build | Complete verifier passes and hashes recorded |
| G2 | Candidate infrastructure | Isolated configuration is proven |
| G3 | Candidate smoke | HTTP, readiness, release, and Socket checks pass |
| G4 | Candidate browser QA | Four viewports and four roles pass |
| G5 | Data rehearsal | Candidate report, execute, resume, retry, and privacy pass |
| G6 | Production protection | Restorable snapshot, indexes, and baseline proven |
| G7 | Production canary | Accepted SHA is deployed and core writes pass |
| G8 | Production backfill | Guarded batches pass every stop condition |
| G9 | Final acceptance | Browser, Socket, privacy, and external degradation pass |
| G10 | Observation | 30-60 minute health window passes and is signed |

## G0 - Freeze the release

1. Confirm the branch and worktree.

```powershell
git branch --show-current
git status --short
git fetch origin
$env:RELEASE_SHA = git rev-parse HEAD
git show --no-patch --format='%H %cI %s' $env:RELEASE_SHA
```

2. Record the SHA, branch, timestamp, previous production SHA/deploy ID, and owner in the checklist.
3. Confirm `git status --short` is empty. Stop if it is not empty.
4. Freeze change control. Any subsequent repository change invalidates downstream evidence.

## G1 - Verify and hash the build

Run on Node 24.16.0 and npm 11.13.0 from the repository root. `RELEASE_SHA` is
required and must be the exact 40-character hexadecimal SHA returned by
`git rev-parse HEAD`; `npm run verify:release` fails before build/test work when
it is missing, malformed, or does not match the current commit.

```powershell
node --version
npm.cmd --version
npm.cmd ci --no-audit --no-fund
npm.cmd ci --prefix backend --no-audit --no-fund
npm.cmd ci --prefix frontend --no-audit --no-fund
npm.cmd run verify:release
git status --short
```

Pass only when every verifier step exits zero, the worktree remains clean, and both SHA-256 artifact hashes are recorded. Stop for any test, lint, type, build, audit, diff, clean-status, or artifact failure.

## G2 - Provision isolated candidate infrastructure

1. Create `bliver-candidate` from `render.yaml`; keep auto-deploy disabled.
2. Select the frozen commit, not a branch tip that can move.
3. Set candidate secrets in Render. Do not copy production JWT, admin, VAPID, Mongo database name, or Cloudinary folder.
4. It is acceptable to use the same Atlas cluster or Cloudinary account only when the database name and folder are different and access is scoped.
5. Confirm the candidate configuration without displaying values:

| Contract | Required candidate state |
| --- | --- |
| Runtime | Node 24.16.0 |
| Root/build/start | repository root / `npm run render-build` / `npm start` |
| Health path | `/readyz` |
| Deploy mode | manual, frozen SHA |
| Mongo | candidate-only database |
| Cloudinary | candidate-only folder |
| Environment | `DEPLOY_ENV=candidate`, `VITE_DEPLOY_ENV=candidate` |

Stop if any candidate resource points at the production database or if Render cannot show the frozen commit.

## G3 - Candidate deploy and smoke

Wait for Render to report live, then require the exact SHA.

```powershell
$env:BASE_URL = $env:CANDIDATE_URL
$env:EXPECTED_RELEASE = $env:RELEASE_SHA
npm.cmd run smoke:release
```

`EXPECTED_RELEASE` is required for smoke and must be the same 40-character
hexadecimal SHA as `RELEASE_SHA`. Smoke fails before making HTTP requests when
the variable is missing or invalid, and it compares `/healthz` and `/versionz`
releases exactly. Commands print only check names and statuses; never print
response bodies, SHA values, URIs, or secrets.

Separately inspect `/healthz`, `/readyz`, and `/versionz` headers and JSON. All must be `Cache-Control: no-store`; readiness must be 200 with both database and frontend true; release must equal the frozen SHA. Record the Render deploy ID and smoke timestamp.

Stop on a SHA mismatch, non-JSON health response, readiness failure, missing request IDs, guest API failure, unauthenticated route not returning 401, Socket polling failure, or secret-bearing output.

Before creating the disposable candidate admin or calling `/api/admin/setup`, verify and remove any
legacy bootstrap TTL index. Run the dry-run first, execute only when the exact named index is
reported present, then run the dry-run again and record both redacted status objects:

```powershell
node backend/scripts/remove-admin-bootstrap-ttl-index.js
node backend/scripts/remove-admin-bootstrap-ttl-index.js --execute --confirm-execute DROP_ADMIN_BOOTSTRAP_TTL_INDEX
node backend/scripts/remove-admin-bootstrap-ttl-index.js
```

The migration is index-only and must report `index`/`dropped` status fields without database URIs,
secrets, account identifiers, or other PII. Stop if any other index is changed or the final status
is not `absent`.

## G4 - Candidate browser and Socket acceptance

Use the matrix in `docs/qa/eight-phase-release-checklist.md` at 360x800, 390x844, 430x932, and 1440x1000.

1. Test guest, disposable admin, user A, and user B.
2. Use two simultaneous authenticated sessions for online/offline, messages, typing, notifications, and forced logout.
3. Check keyboard navigation, focus restoration, safe areas, reduced motion, offline/retry states, long text, and image failures.
4. Verify public/friends/private and precise/approximate footprints never expose forbidden coordinates, IPs, tokens, or private records.

Any P0/P1, auth bypass, privacy leak, incoherent overlap, blank map, or broken primary workflow stops the release.

## G5 - Candidate data rehearsal

Run only against the candidate database.

```powershell
npm.cmd run --prefix backend backfill:footprint-geography:report
npm.cmd run --prefix backend backfill:footprint-geography:dry-run -- --limit 10
npm.cmd run --prefix backend backfill:footprint-geography:execute -- --limit 5 --delay 1000 --confirm-execute BACKFILL_FOOTPRINT_GEOGRAPHY
npm.cmd run --prefix backend backfill:footprint-geography:report
```

Record redacted JSON counts and the returned opaque cursor/window identifiers without exposing their values in shared evidence. Prove cursor resume, a repeated idempotent run, a controlled failure/retry, stale lease recovery, and no raw location/content/error/runToken fields in report output.

Stop on unexpected failed/dead/conflict counts, provider 429s, readiness loss, SHA mismatch, lease ownership anomalies, or a non-idempotent repeat.

## G6 - Protect production

1. Record the current production SHA, Render deploy ID, build/start/root/health settings, and redacted environment-key inventory.
2. Create a production snapshot using the provider backup or a secured MongoDB Database Tools config. Record the backup ID, database name identifier, timestamp, tool/version, and encrypted storage location.
3. Restore that snapshot into a new non-production database. Compare collection names, document counts, representative application reads, and required indexes. A snapshot without a successful restore test does not pass.
4. List indexes and run representative `explain('executionStats')` checks for activity windows and region backfill selection. Record winning index names and bounded scan counts, not query data.
5. Run the production backfill report and dry-run only. Do not execute yet.
6. Read-only verify there is exactly one intended founder candidate and no conflicting `systemIdentity: 'asen'`. Record whether the controlled founder already has the immutable identity and admin role; do not migrate or otherwise write at this gate.

Stop for missing/invalid unique indexes, non-restorable backup, unexpected founder count, identity conflict, unhealthy database, or any production mutation before this gate passes.

## G7 - Promote the same SHA and canary

Confirm production `main` can fast-forward to the frozen SHA. A merge commit changes the SHA and requires candidate re-acceptance.

```powershell
git fetch origin
git merge-base --is-ancestor origin/main $env:RELEASE_SHA
git push origin "$($env:RELEASE_SHA):refs/heads/main"
```

Align production Render root/build/start/health settings with `render.yaml`, then manually deploy the accepted SHA. Verify `/versionz` before any write.

Before any production admin bootstrap or founder/admin login cutover, run the bootstrap TTL-index
migration against the production database after the snapshot/restore evidence is recorded: dry-run, then (only if
`index: present`) `--execute --confirm-execute DROP_ADMIN_BOOTSTRAP_TTL_INDEX`, then dry-run again.
Record both status objects and the exact index result in the checklist; do not include URIs, secrets,
account identifiers, or PII.

If the G6 read-only check found that the controlled founder lacks the immutable identity or admin
role, run the guarded founder migration against the production database now, before the first
controlled write, and record only its sanitized status:

```powershell
node backend/scripts/migrate-founder-identity.js --execute --confirm-execute MIGRATE_BLIVER_FOUNDER
```

Run a small canary with disposable accounts: register/login/logout, admin setup or existing admin login, public/friends/private precise/approximate check-ins, comment/reply/reaction, report/resolve, message/block/unblock, and forced logout. Delete disposable content only through normal product/admin APIs.

Stop and roll back the whole service for any auth/privacy failure, 5xx increase, readiness loss, Socket breakage, or SHA mismatch.

## G8 - Guarded production backfill

Use one operator and one process. Save each report and cursor before the next batch.

```powershell
npm.cmd run --prefix backend backfill:footprint-geography:report
npm.cmd run --prefix backend backfill:footprint-geography:dry-run -- --limit 10
npm.cmd run --prefix backend backfill:footprint-geography:execute -- --limit 5 --delay 1000 --confirm-execute BACKFILL_FOOTPRINT_GEOGRAPHY
npm.cmd run --prefix backend backfill:footprint-geography:report
```

If the first batch passes, continue with limits from 50 through 100, always with delay at least 1000 ms and the opaque cursor returned by the previous run. Review failed/dead records before any `--retry-failed` run.

Stop immediately on auth/privacy failure, readiness failure, SHA mismatch, database error, unexpected failed/dead/conflict counts, provider 429, lease/cursor anomaly, or material latency/error growth. Preserve cursor, lease, and runToken state. Do not run a reverse migration.

## G9 - Final browser, Socket, and degradation checks

Repeat G3 and G4 against production. In addition, simulate or safely observe Cloudinary, Nominatim, map tile, weather tile, and push failures. The application must retain navigation, safe error copy, privacy, and retry/recovery behavior.

Record screenshots at all four viewports, two-user Socket timestamps, request IDs for representative failures, and redacted provider status. Stop for P0/P1 or privacy regressions.

## G10 - Observe and sign

Observe production for at least 30 minutes; use 60 minutes after any production migration or elevated error rate.

Track readiness, release SHA, HTTP 4xx/5xx, p50/p95 latency, Mongo connections/errors, Socket connections, memory/CPU, provider 429/5xx, failed/dead backfill counts, and client Sentry events. Compare with the pre-release baseline.

Sign only when all checklist evidence is complete and no stop condition is active.

## Rollback

1. Stop all backfill runners and preserve their opaque state.
2. Redeploy the recorded previous whole-service SHA in Render. Do not attempt frontend-only rollback.
3. Re-run health/version/guest/Socket smoke and confirm the rollback SHA.
4. If incompatible production writes occurred, restore the proven snapshot into a controlled replacement database and repoint the whole service under an incident plan. There is no reverse backfill migration.
5. Record incident timestamps, rollback deploy ID, database decision, residual failed/dead records, and follow-up owner.
