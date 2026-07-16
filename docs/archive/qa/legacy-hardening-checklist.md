# Legacy surface hardening checklist

Use this checklist for older admin, announcement, feedback, messaging, map, and service-worker surfaces that remain part of the combined release.

## Authentication and sessions

- [ ] Register rejects short passwords and reserved founder name; legacy valid passwords still log in. Evidence:
- [ ] `/api/auth/me` hydrates user/role/sessionVersion from MongoDB, not JWT claims. Evidence:
- [ ] Malformed, deleted-user, stale-version, and demoted-role tokens fail safely. Evidence:
- [ ] Optional-auth routes reject malformed supplied tokens instead of treating them as guests. Evidence:
- [ ] Temporary and persistent sessions use separate storage lifetimes; logout clears both. Evidence:
- [ ] Legacy credential/autologin keys are purged and passwords are never stored. Evidence:
- [ ] Cross-tab login/logout and force logout cannot leave an active stale Socket. Evidence:

## Founder and admin controls

- [ ] No route/service authorizes from the display name `阿森`. Evidence:
- [ ] Founder-specific presentation uses immutable system identity only. Evidence:
- [ ] Announcement creation, comment moderation, report resolution, audit access, and user administration require admin role. Evidence:
- [ ] Admin bootstrap exact-secret comparison, rate limit, one-time lock, concurrent rejection, fresh token, and audit pass. Evidence:
- [ ] Bootstrap failure compensation does not revalidate an older token. Evidence:
- [ ] Admin password edit and kick invalidate all old HTTP and Socket sessions. Evidence:
- [ ] Founder migration dry-run/index/conflict/confirmation/output privacy pass. Evidence:

## Admin panel and audit

- [ ] User list, online list, clone detection, feedback, reports, and audit tabs load independently. Evidence:
- [ ] Loading, empty, retry, 403, and 500 states do not expose provider/database errors. Evidence:
- [ ] Admin user rename/password validation matches API policy. Evidence:
- [ ] Admin cannot kick/delete protected admin accounts through stale UI state. Evidence:
- [ ] Audit entries contain action/actor/target metadata but no passwords, setup secret, JWT, URI, content, or coordinates. Evidence:
- [ ] AdminPanel works at all four release viewports with keyboard and focus containment. Evidence:

## Announcements and feedback

- [ ] Guest can read announcements; only admin can create them. Evidence:
- [ ] Same-name ordinary user receives 403 for announcement creation. Evidence:
- [ ] Announcement unread state, open/close, refresh, long content, and empty/error states pass. Evidence:
- [ ] Feedback submit, admin list/status change, duplicate/slow/error behavior pass. Evidence:
- [ ] Announcement/feedback Socket or custom events do not leak private/admin payloads. Evidence:

## Friends and messaging

- [ ] Friend request, accept, reject, remove, pending count, and online presence pass for user A/B. Evidence:
- [ ] Founder forced-friend/presentation behavior resolves canonical database identities. Evidence:
- [ ] Same-name ordinary user receives no friend/message/broadcast bypass. Evidence:
- [ ] Stranger message setting, greeting/reply/ignore/remove, block/unblock, unread, and typing pass. Evidence:
- [ ] Blocked or unauthorized users cannot infer private conversation/message metadata. Evidence:
- [ ] Two real Socket clients receive only authorized online/offline/message events. Evidence:

## Map, Activity, and check-in

- [ ] Map initializes with visible tiles/markers and remains usable when optional layers fail. Evidence:
- [ ] Search, filters, same-place sheet, cluster panel, preview card, recenter, pan, and fly effects pass. Evidence:
- [ ] Guest Activity/map APIs return only public sanitized footprints. Evidence:
- [ ] Friends/private policy is consistent across HTTP, map, Activity, profile, and Socket. Evidence:
- [ ] Precise/approximate selection is preserved on create/edit/read and never leaks `realLocation`. Evidence:
- [ ] Nominatim/weather/tile timeouts use safe fallbacks without duplicate check-ins. Evidence:
- [ ] Backfill discovery-window concurrency/index behavior passes three consecutive runs. Evidence:

## Upload, push, service worker, and observability

- [ ] Multer 2.x file size/type rejection and Cloudinary success path pass. Evidence:
- [ ] Cloudinary folder matches environment and failure response is generic. Evidence:
- [ ] Push subscribe/unsubscribe/expired subscription/denied permission paths pass. Evidence:
- [ ] Service worker install/activate/fetch code passes scoped globals and does not cache private API responses. Evidence:
- [ ] `/healthz`, `/readyz`, `/versionz` are JSON/no-store and expose only safe release metadata. Evidence:
- [ ] SIGTERM/SIGINT close HTTP, Socket.IO, and Mongo once, then exit once. Evidence:
- [ ] Request logs/Sentry include request/release/environment identifiers but exclude secrets and response bodies. Evidence:

## Accessibility and resilience

- [ ] Topmost-modal Escape handling and focus restoration pass for nested legacy surfaces. Evidence:
- [ ] Keyboard order, labels, 44px targets, contrast, safe areas, and reduced motion pass. Evidence:
- [ ] Offline, abort, timeout, rate-limit, and server-error states preserve navigation and retry safety. Evidence:
- [ ] Long translated text and missing images do not resize fixed controls or overlap content. Evidence:

## Release result

- [ ] Frontend lint exits zero with no correctness-rule errors. Evidence:
- [ ] Backend/frontend tests, typecheck, build, audits, smoke, and artifact hashes pass on the frozen SHA. Evidence:
- [ ] No P0/P1, auth/privacy defect, raw provider error, or unowned exception remains. Evidence:
- [ ] Legacy hardening QA owner sign-off. Evidence:

