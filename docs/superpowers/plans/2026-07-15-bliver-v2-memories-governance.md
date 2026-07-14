# Bliver V2 Phase 6 Memories, Notifications, and Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the long-term memory experience, reliable notifications and Push delivery, and a database-authoritative moderation/admin workspace.

**Architecture:** Memories owns read projections over authorized footprints and media. Notifications consumes domain events and owns delivery preferences. Moderation owns reports, cases, admin commands and immutable audit. None of these modules bypass Footprint or Social policies.

**Tech Stack:** PostgreSQL/Drizzle, Outbox, Express 5, Cloudinary references, Web Push, React Router, TanStack Query, Playwright.

---

## Files and ownership

- Create migration: `apps/api/drizzle/0005_memories_notifications_moderation.sql`.
- Create modules: `apps/api/src/modules/memories`, `apps/api/src/modules/notifications`, `apps/api/src/modules/moderation`.
- Extend: `apps/api/src/outbox`, `apps/api/src/platform/observability`, `packages/contracts/src/memories.ts`, `packages/contracts/src/notifications.ts`, `packages/contracts/src/moderation.ts`.
- Create Web features: `apps/web/src/features/memories`, `apps/web/src/features/notifications`, `apps/web/src/features/moderation`.
- Create evidence: `docs/qa/v2-phase-6-memories-governance.md`.

## Canonical interfaces

```ts
export interface MemoryQueryPort {
  map(ownerId: UserId, viewer: ActorContext | null): Promise<readonly FootprintDto[]>;
  timeline(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<ActivityPageDto>;
  photos(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<MediaPageDto>;
}

export interface MediaPageDto {
  items: readonly { assetId: string; footprintId: FootprintId; url: string; createdAt: string }[];
  nextCursor?: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  actor?: { id: UserId; name: string };
  target: { type: string; id: string };
  readAt?: string;
  createdAt: string;
}

export interface AdminCommandContext extends ActorContext {
  readonly caseId: string;
  readonly reason: string;
}
```

Admin commands require `AdminCommandContext`; a role alone is insufficient for private-content access.

## Task 1: Build authorized memory projections

- [ ] Write repository tests for owner-only private memories, friend-visible memories, public history after discovery expiry, blocked users, media variants and visitor visibility.
- [ ] Add `profile_visitors`, `memory_highlights`, and optional `memory_projection_versions`; do not duplicate footprint facts into writable profile documents.
- [ ] Implement `MemoryQueryPort` for personal map, timeline, photo archive, visitor list and retrospective summaries.
- [ ] Reuse `FootprintVisibilityPolicy` and `BlockPolicy` in every query; test that no projection bypasses them.
- [ ] Consume `FootprintPublished`, `FootprintVisibilityChanged`, `CommentAdded`, and `ReactionAdded` events idempotently.
- [ ] Commit `feat: add authorized memories projections`.

## Task 2: Build the Memories Web feature

- [ ] Write tests for `/me`, `/me/map`, `/me/timeline`, `/me/photos`, `/me/visitors`, empty states, slow loading, deleted footprints and media failure.
- [ ] Implement the three memory views under one feature route; reuse the shared footprint detail route and UI primitives.
- [ ] Add profile view for another user with visibility-aware counts and no profile message board/reaction duplication.
- [ ] Add memory actions: open map location, open footprint detail, edit personal profile, manage privacy settings and revoke sessions.
- [ ] Add Playwright owner/visitor flows for private/friend/public history and visitor privacy.
- [ ] Commit `feat: add V2 memories experience`.

## Task 3: Model notifications and delivery preferences

- [ ] Write tests for event-to-notification mapping, deduplication, read/unread counts, actor privacy, blocked actors and notification retention.
- [ ] Add `notifications`, `notification_preferences`, `push_subscriptions`, and `delivery_attempts` tables with user/index constraints.
- [ ] Implement event consumers for reactions, comments, friendship, greeting, message, reports and admin actions.
- [ ] Provide `GET /api/v1/notifications`, `POST /api/v1/notifications/:id/read`, `POST /api/v1/notifications/read-all`, and preferences routes.
- [ ] Ensure notification payloads contain safe references and never private coordinates or hidden content.
- [ ] Commit `feat: add notification center`.

## Task 4: Add Web Push without coupling it to core notifications

- [ ] Write adapter tests for VAPID configuration missing, subscription replacement, unsubscribe, expired endpoint cleanup and provider failure.
- [ ] Implement `PushAdapter` and a retry-limited notification delivery consumer; Push failure must leave the in-app notification intact.
- [ ] Add Web and Capacitor permission prompts only from explicit user actions; never request permission on app load.
- [ ] Add `/api/v1/push/subscribe`, `/api/v1/push/unsubscribe`, and public-key endpoints with ownership checks.
- [ ] Commit `feat: add optional push delivery`.

## Task 5: Build moderation cases and admin commands

- [ ] Write tests for report queue authorization, case transitions, evidence references, audit immutability, user role changes, session revocation and footprint moderation.
- [ ] Add `moderation_cases`, `moderation_actions`, `audit_logs`, and `admin_roles` tables; role checks must read database state.
- [ ] Implement `OpenCase`, `ResolveCase`, `HideFootprint`, `RestoreFootprint`, `SuspendUser`, `ChangeRole`, and `RevokeAllSessions` commands.
- [ ] Require a moderation case for private-content access and record actor, target, reason, before/after summary and timestamp.
- [ ] Add `/api/v1/admin/reports`, `/api/v1/admin/users`, `/api/v1/admin/audit`, `/api/v1/admin/sessions`, and `/api/v1/admin/footprints`.
- [ ] Emit `ReportResolved`, `UserSuspended`, `RoleChanged`, and `SessionsRevoked` events after successful audited commands.
- [ ] Remove all display-name-based privilege checks in V2.
- [ ] Commit `feat: add database-authoritative moderation`.

## Task 6: Build notifications and admin Web workspaces

- [ ] Write tests for notification panel, unread state, retry, admin route guard, report queue, case resolution, user suspend, role change and audit display.
- [ ] Implement `/notifications` and `/admin` as route-level workspaces, not map overlays.
- [ ] Keep admin components outside user-facing feature packages and require a fresh role query before destructive actions.
- [ ] Add keyboard/focus restoration, bounded tables, confirmation dialogs and explicit empty/error states.
- [ ] Add Playwright admin/user flows for report creation, resolution, audit visibility, role changes and forced session logout.
- [ ] Commit `feat: add notification and admin workspaces`.

## Phase 6 exit gate

Run:

```text
npm.cmd run db:v2:migrate
npm.cmd run typecheck:v2
npm.cmd run lint:v2
npm.cmd run test:v2
npx playwright test apps/web/e2e/memories-governance.spec.ts
```

The phase passes only when private/friend/public history is enforced across memory queries, Push failure does not remove in-app notifications, admin actions are database-authoritative and audited, and no display-name privilege path remains. Commit `docs/qa/v2-phase-6-memories-governance.md` and tag the accepted SHA as `v2-phase-6-memories-governance`.
