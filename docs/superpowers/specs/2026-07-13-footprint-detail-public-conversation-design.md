# Bliver Footprint Detail and Public Conversation

## Summary

Phase 4 replaces the legacy dark footprint detail modal with a Natural City bottom detail sheet while preserving map context. The sheet becomes the shared entry point from Map previews, Activity cards, and footprint deep links. It adds chronological public conversation with at most two comment levels, reaction consistency, permission-driven moderation menus, and report handling without creating a second visibility policy.

The existing `FootprintDetailModal` entry contract remains during migration so Map and Activity can roll back independently. The legacy endpoint and legacy timeline stay available until automated and browser acceptance gates pass.

## Confirmed Product Decisions

- Detail opens as a bottom sheet; the map remains visible behind it.
- The sheet starts at roughly 72% viewport height and can expand to roughly 94% by drag or an explicit expand affordance.
- Comments are shown immediately, ordered oldest to newest within each level.
- Replies are indented one level and are limited to two total levels.
- Report and delete actions are inside a single “More” menu.
- A comment can be deleted only by its author or an administrator. A footprint author cannot delete another person’s comment.
- Guests may read eligible public detail but must authenticate before reacting, commenting, replying, or reporting. Login restores the selected footprint and pending draft/action without duplicate submission.
- Coral is reserved for publish and urgent attention; the detail sheet uses forest, sage, paper, and restrained borders/shadows.

## Architecture

The backend continues to call the shared `FootprintVisibilityPolicy` before every detail read, reaction, comment, reply, delete, or report operation. No detail-only authorization branch is introduced.

The existing `FootprintDetailModal` remains the public component entry point while its internals are split into focused units:

- `FootprintDetailSheet` owns sheet geometry, backdrop, drag/expand state, and lifecycle.
- `FootprintConversation` owns chronological top-level comments, one-level replies, composer state, and cache updates.
- `ModerationMenu` owns permission-derived More actions and confirmation flows.
- Existing reaction behavior is adapted to the Natural City visual contract and the shared React Query cache.

React Query is the only server-state source for detail, map, and Activity copies. Socket events update or invalidate those query prefixes. Local state is limited to sheet interaction, pending forms, and transient feedback.

## Data Model and API

### Comment shape

Each comment stores:

- `userId`, `username`, `content`, `ipAddress`, `createdAt`;
- optional `parentCommentId`, identifying the top-level comment;
- optional `replyToCommentId`, identifying the direct comment being answered;
- optional `replyToUser`, a server-resolved display snapshot.

Legacy comments without parent fields remain top-level. The service groups replies under their top-level parent and sorts by `createdAt ASC, _id ASC` for deterministic ordering.

### Comment endpoints

Use the existing route family during migration, extending the request body with optional parent fields:

- `POST /api/footprints/:id/comment` accepts `content`, `parentCommentId`, and `replyToCommentId`.
- `DELETE /api/footprints/:footprintId/comments/:commentId` deletes only when the actor owns the comment or is an administrator.

The service rejects a missing parent, a cross-footprint target, a third-level reply, or a reply to a deleted/missing target. Deleting a top-level comment with replies keeps an anonymized placeholder so replies retain context; a leaf comment is removed. Server responses return the sanitized footprint and updated comment tree.

### Reports

Add a `Report` model with `reporterId`, `targetType` (`footprint` or `comment`), `targetId`, `footprintId`, `reason`, optional bounded `details`, `status` (`pending`, `actioned`, `dismissed`), reviewer metadata, and timestamps. A unique pending constraint for `(reporterId, targetType, targetId)` makes repeat submissions idempotent.

- `POST /api/reports` requires authentication, visibility of the target, rejects self-reports, validates a bounded reason enum/details, and is rate limited.
- Admin-only report list, dismiss, and action routes expose pending reports and write audit records. “Action” requires an explicit content deletion choice; reports never auto-delete content.

Reaction toggling remains one emoji per user: selecting the current emoji removes it, selecting another replaces it. Reaction and conversation mutations return the sanitized footprint and emit the existing footprint update event.

## Frontend Interaction and Visual Contract

The sheet content order is stable: author and relationship label, place/time, text/photo, reactions, comments, then composer. It uses safe-area padding, a 44px minimum target size, visible focus, keyboard-aware scrolling, and a single scrim. Desktop uses a centered narrow panel with the same hierarchy.

The More button exists once per footprint and comment. It opens a lightweight menu without changing scroll position. Footprint deletion is visible only to administrators; comment deletion is visible only to the comment owner or administrator; report is visible for eligible non-owned content. Menu actions have loading, success, failure, and retry states.

The signature detail treatment is a single forest-green footprint ring shared by the selected map marker and sheet header. Opening or expanding may play one short pulse; reduced-motion removes it. No glass panels, neon gradients, looping decoration, nested cards, or arbitrary z-index layers are introduced.

## Authorization and Failure Behavior

- A viewer who loses access through a visibility update or deletion has the sheet closed and the relevant Map/Activity cache invalidated.
- Failed comment/reply/report operations preserve draft text and expose an inline retry action.
- Successful mutations update every matching Map, Activity, and detail cache copy; no parallel Zustand comment list is maintained.
- Offline detail renders cached data with a stale notice. Reconnection or a Socket event triggers refetch/invalidation.
- Deleting a parent with replies keeps the placeholder; deleting a leaf removes only that comment.

## Testing and Acceptance

### Backend tests

Add failing tests before implementation for comment depth and ordering, legacy top-level compatibility, shared visibility authorization, self/other/admin deletion permissions, parent placeholder behavior, report validation/idempotency/self-report rejection, and admin report action/audit behavior.

### Frontend tests

Add failing tests before implementation for bottom-sheet semantics and expansion, immediate chronological comments, reply target and depth limit, guest login restoration, More-menu permissions, mutation loading/error/retry states, multi-cache synchronization, and realtime close-on-invisibility.

### Verification

Run backend and frontend suites, frontend typecheck, production build, and `git diff --check`. Inspect the sheet at 360x800, 390x844, 430x932, and 1440x1000, including long text, tall images, keyboard focus, reduced motion, offline retry, empty comments, and deleted/blocked content. Record Impeccable detector output and the frontend-design critique in the phase QA checklist. Do not push, deploy, or run real geographic backfill.

## Scope Exclusions

Stranger greetings, conversation unlocking, blocking, profile/Me redesign, route-level code splitting, historical visibility migration, and changes to the legacy timeline are deferred to their roadmap phases.
