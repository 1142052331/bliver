# Profile and memories acceptance checklist

Run with guest, owner, accepted friend, unrelated user, and admin. Record request IDs and screenshots; never attach raw private payloads or precise coordinates.

## Setup

- [ ] Frozen release SHA and environment recorded. Evidence:
- [ ] Disposable owner/friend/other/admin account IDs recorded as redacted aliases. Evidence:
- [ ] Public, friends, and private fixtures exist with both precise and approximate location modes. Evidence:
- [ ] Comment, reaction, profile visitor, image, and no-image fixtures exist. Evidence:

## Profile access and identity

- [ ] Guest can open a public profile without receiving private owner fields. Evidence:
- [ ] Owner sees edit controls, banner/avatar actions, visitor list, and own private memories. Evidence:
- [ ] Friend and unrelated user see only policy-authorized profile/memory data. Evidence:
- [ ] Admin presentation is correct but does not rely on display name for authorization. Evidence:
- [ ] Rename updates profile, map, Activity, comments, notifications, and Socket views consistently. Evidence:
- [ ] Reserved founder name attempts fail for ordinary owner and admin rename paths. Evidence:
- [ ] Avatar/banner upload success and generic failure states are usable and privacy-safe. Evidence:

## Memory visibility

- [ ] Public precise memory appears in owner profile, map, and Activity with permitted detail. Evidence:
- [ ] Public approximate memory shows only sanitized location in every surface and payload. Evidence:
- [ ] Friends-only memory appears for accepted friend and not for guest/unrelated user. Evidence:
- [ ] Private memory appears for owner and authorized admin only. Evidence:
- [ ] Direct footprint/profile API requests cannot bypass visibility. Evidence:
- [ ] Socket create/update/delete events do not reveal hidden memory metadata. Evidence:
- [ ] Map clustering and profile counts do not leak the existence of hidden records. Evidence:

## Comments, reactions, and visits

- [ ] Add profile comment validates empty/long content and updates without duplicate entries. Evidence:
- [ ] Add/toggle profile reaction updates sender identity and toggle-off state. Evidence:
- [ ] Recent footprint comments/reactions include only readable footprints. Evidence:
- [ ] A hidden footprint cannot be inferred through recent activity lists or counts. Evidence:
- [ ] Profile visit is recorded once per intended period and not for self-view. Evidence:
- [ ] Visitor list is visible only to owner/admin policy and contains no IP/token data. Evidence:
- [ ] Deleted users/content render a safe fallback without broken links. Evidence:

## Drawers, navigation, and mobile behavior

- [ ] ProfileDrawer opens from map marker, Activity, comment avatar, chat, and notification. Evidence:
- [ ] TimelineDrawer/Profile memories selection opens the correct footprint without route loss. Evidence:
- [ ] ClusterDetailPanel, TimelineDrawer, and ProfileDrawer stacking/closing order is coherent. Evidence:
- [ ] Escape closes only the topmost surface and restores focus to the opener. Evidence:
- [ ] Back navigation does not reopen stale profile or lose current map context. Evidence:
- [ ] 360x800, 390x844, and 430x932 respect safe areas and raised navigation. Evidence:
- [ ] 1440x1000 keeps profile content scannable without oversized card/text treatment. Evidence:
- [ ] Long names, messages, empty/loading/error states, and missing images do not overlap. Evidence:
- [ ] Keyboard, screen-reader labels, 44px targets, and reduced motion pass. Evidence:

## Real-time and failure behavior

- [ ] Two sessions observe profile avatar/name/banner/comment/reaction updates in the correct order. Evidence:
- [ ] Offline/reconnect does not duplicate comments, reactions, visits, or notifications. Evidence:
- [ ] Forced logout closes or disables owner-only actions across all tabs/Sockets. Evidence:
- [ ] Cloudinary failure is generic and preserves the previous avatar/banner. Evidence:
- [ ] API 401/403/404/409/500 states use safe copy and provide a recovery path. Evidence:
- [ ] Slow profile/memory requests retain layout and do not show another user's stale data. Evidence:

## Privacy payload audit

- [ ] Guest payload excludes password, JWT, sessionVersion, system-only fields, IPs, visitor list, and hidden records. Evidence:
- [ ] Approximate payload excludes precise `realLocation` and equivalent nested coordinates. Evidence:
- [ ] Report/log/Sentry evidence contains IDs/status only, not profile content or coordinates. Evidence:
- [ ] Browser storage contains token/user pair only in the selected lifetime and never a password. Evidence:

## Result

- [ ] No P0/P1, privacy leak, authorization-by-name behavior, or broken primary profile workflow remains. Evidence:
- [ ] Profile/memories QA owner sign-off. Evidence:

