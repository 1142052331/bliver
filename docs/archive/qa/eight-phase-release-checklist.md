# Eight-phase release acceptance checklist

Complete this file with non-sensitive evidence references. Empty evidence fields mean the gate has not passed.

## Release identity

- [ ] Frozen 40-character SHA recorded. Evidence:
- [ ] Branch and freeze timestamp recorded. Evidence:
- [ ] Previous production SHA and Render deploy ID recorded. Evidence:
- [ ] Release owner and rollback owner recorded. Evidence:
- [ ] Candidate and production deploys show the same accepted SHA. Evidence:

## G0-G1 freeze and build

- [ ] `git status --short` was empty at freeze and after verification. Evidence:
- [ ] Node 24.16.0 and npm 11.13.0 recorded. Evidence:
- [ ] `npm run verify:release` exited zero on the frozen SHA. Evidence:
- [ ] Backend test count, frontend test count, lint error count, and audit results recorded. Evidence:
- [ ] `frontend/dist/index.html` SHA-256 recorded. Evidence:
- [ ] Stable asset-list SHA-256 and file count recorded. Evidence:
- [ ] GitHub Actions backend, frontend, and release jobs passed. Evidence:

## G2 candidate isolation

- [ ] Candidate Render service ID and deploy ID recorded. Evidence:
- [ ] Candidate auto-deploy is off and deployed commit is frozen. Evidence:
- [ ] Candidate Mongo database identifier differs from production. Evidence:
- [ ] Candidate JWT/admin/VAPID secrets were independently generated. Evidence:
- [ ] Candidate Cloudinary folder differs from production. Evidence:
- [ ] Candidate environment is `candidate`; no production API/socket override is present. Evidence:
- [ ] Environment evidence contains key names only, never values. Evidence:

## G3 HTTP and Socket smoke

- [ ] `/` returned inspectable HTML 200. Evidence:
- [ ] `/healthz` returned JSON 200, `no-store`, request ID, Node 24, exact SHA. Evidence:
- [ ] `/readyz` returned JSON 200 with database/frontend true. Evidence:
- [ ] `/versionz` returned JSON 200 with exact SHA and candidate/production environment. Evidence:
- [ ] Guest `/api/activity` returned JSON 200 and no private fields. Evidence:
- [ ] Guest `/api/map/footprints` returned JSON 200 and no private fields. Evidence:
- [ ] Unauthenticated protected endpoint returned JSON 401. Evidence:
- [ ] Socket.IO polling returned 200 and a real client connected. Evidence:
- [ ] `npm run smoke:release` exited zero with `EXPECTED_RELEASE`. Evidence:

## Four-viewport browser matrix

For each cell record a screenshot set and a short result ID. Check app identity, map, navigation, overlays, text fit, and interaction targets.

| Role/session | 360x800 | 390x844 | 430x932 | 1440x1000 |
| --- | --- | --- | --- | --- |
| Guest | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: |
| Admin | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: |
| User A | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: |
| User B | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: | [ ] Evidence: |

- [ ] No incoherent overlap, clipping, blank map, horizontal page scroll, or hidden primary action. Evidence:
- [ ] 44px controls, keyboard order, visible focus, Escape behavior, and focus restoration pass. Evidence:
- [ ] Safe-area top/bottom padding passes on mobile sizes. Evidence:
- [ ] Reduced-motion mode removes nonessential movement without hiding state. Evidence:
- [ ] Long names/messages and loading/error/empty states fit their containers. Evidence:

## Auth, identity, and administration

- [ ] Guest interaction prompts login without losing the intended action. Evidence:
- [ ] Temporary login uses session storage; persistent login uses local storage. Evidence:
- [ ] No password or legacy credential/autologin key exists in either storage. Evidence:
- [ ] Reserved founder name cannot be claimed by register/profile/admin rename. Evidence:
- [ ] A same-name ordinary user gains no admin, moderation, message, or broadcast privilege. Evidence:
- [ ] Admin bootstrap succeeds once, returns a fresh token, and rejects concurrent/repeated attempts. Evidence:
- [ ] Password change, kick, role change, and founder migration invalidate old tokens. Evidence:
- [ ] Kick disconnects every active Socket for the account. Evidence:
- [ ] Announcement, audit, report resolution, and moderation require database-authoritative admin role. Evidence:

## Visibility, location, and social workflows

- [ ] Public precise check-in is visible with permitted location detail. Evidence:
- [ ] Public approximate check-in never reveals precise coordinates. Evidence:
- [ ] Friends-only check-in is visible to accepted friend and hidden from other user/guest. Evidence:
- [ ] Private check-in is visible only to owner/admin where policy allows. Evidence:
- [ ] Map, Activity, profile, memories, Socket payloads, and notifications enforce the same visibility. Evidence:
- [ ] Comment, reply, reaction, delete, report, and resolve update all active sessions correctly. Evidence:
- [ ] Friend request/accept/reject/remove and unread state pass. Evidence:
- [ ] Message, typing, unread, block, unblock, stranger settings, and forced logout pass with user A/B. Evidence:
- [ ] Payload samples exclude IP addresses, passwords, JWTs, runTokens, private footprints, and forbidden coordinates. Evidence:

## Candidate backfill rehearsal

- [ ] Initial report JSON contains only counts and no location/content/error/token values. Evidence:
- [ ] Default and explicit dry-run perform zero writes. Evidence:
- [ ] Execute without exact confirmation fails in development/test/production. Evidence:
- [ ] Candidate execute `limit 5 --delay 1000` passes. Evidence:
- [ ] Opaque cursor resume processes the next window without duplicates. Evidence:
- [ ] Repeating the completed window is idempotent. Evidence:
- [ ] Controlled failure, failed/dead review, retry, and stale lease recovery pass. Evidence:
- [ ] Index list and representative explain show expected winning indexes and bounded scans. Evidence:

## Production protection and canary

- [ ] Production snapshot ID/timestamp and encrypted storage reference recorded. Evidence:
- [ ] Snapshot restored into a non-production database; counts/indexes/read samples match. Evidence:
- [ ] Founder read-only audit shows exactly one intended candidate and no identity conflict. Evidence:
- [ ] Pre-release backfill report and dry-run recorded with no writes. Evidence:
- [ ] Production Render root/build/start/health settings align with accepted contract. Evidence:
- [ ] Exact candidate SHA deployed; `/versionz` verified before writes. Evidence:
- [ ] Disposable-account canary passed auth, visibility, interaction, messaging, blocking, reporting, and admin workflows. Evidence:

## Production backfill

- [ ] One runner and operator are named; no concurrent job exists. Evidence:
- [ ] First execute used limit 5-10, delay at least 1000 ms, and exact confirmation. Evidence:
- [ ] Report/cursor/window evidence saved after first batch. Evidence:
- [ ] Each later 50-100 batch passed readiness, errors, latency, provider, failed/dead, and privacy checks. Evidence:
- [ ] Failed/dead records were reviewed before any retry. Evidence:
- [ ] Final report counts and remaining eligible count recorded. Evidence:
- [ ] No reverse migration was attempted. Evidence:

## External degradation

- [ ] Cloudinary upload failure is generic, recoverable, and leaks no provider detail. Evidence:
- [ ] Nominatim failure leaves safe location/error behavior. Evidence:
- [ ] Base/weather tile failure leaves navigation and non-map workflows usable. Evidence:
- [ ] Push denial/offline/provider failure does not break notifications or auth. Evidence:
- [ ] Offline and timeout states support retry without duplicate writes. Evidence:

## Observation and sign-off

- [ ] Observation start/end covers at least 30 minutes, or 60 after migration. Evidence:
- [ ] Readiness and release SHA remained correct. Evidence:
- [ ] 4xx/5xx, p50/p95, CPU/memory, Mongo, Socket, provider, Sentry, failed/dead metrics reviewed. Evidence:
- [ ] No P0/P1, auth/privacy issue, active stop condition, or unowned exception remains. Evidence:
- [ ] Whole-service rollback SHA/deploy ID remains available. Evidence:
- [ ] Release owner sign-off. Evidence:
- [ ] QA owner sign-off. Evidence:
- [ ] Data owner sign-off. Evidence:

## Mandatory stop record

If any item below occurs, do not sign the release. Record the timestamp, gate, request/deploy ID, action, and owner without sensitive payloads.

- [ ] No auth bypass or privacy leak occurred.
- [ ] No readiness failure or SHA mismatch occurred.
- [ ] No unexpected database/lease/cursor conflict occurred.
- [ ] No unexpected failed/dead increase or provider 429 occurred.
- [ ] No material error-rate or latency increase occurred.

