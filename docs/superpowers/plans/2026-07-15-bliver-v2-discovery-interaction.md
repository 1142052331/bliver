# Bliver V2 Phase 4 Discovery and Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the map foundation into a public discovery loop with a unified reverse-chronological Activity stream, reactions, two-level comments, and user reports.

**Architecture:** Discovery owns read models and cursor queries but never writes Footprint facts. Interaction commands remain in Footprints and emit events. Reports are created by Moderation but resolution is deferred to Phase 6. Every response uses the same privacy-filtered footprint DTO.

**Tech Stack:** Express 5, Drizzle/PostGIS, Zod/OpenAPI, PostgreSQL Outbox, TanStack Query, React Router, Playwright.

---

## Files and ownership

- Create migration: `apps/api/drizzle/0003_discovery_interactions.sql`.
- Create modules: `apps/api/src/modules/discovery`, `apps/api/src/modules/moderation/reporting`.
- Extend: `apps/api/src/modules/footprints/{domain,application,infrastructure,transport}` and `apps/api/src/outbox`.
- Create contracts: `packages/contracts/src/discovery.ts`, `packages/contracts/src/interactions.ts`, `packages/contracts/src/reports.ts`.
- Create Web features: `apps/web/src/features/discovery`, `apps/web/src/features/footprints/components/ConversationSection.tsx`.
- Create evidence: `docs/qa/v2-phase-4-discovery-interaction.md`.

## Canonical interfaces

```ts
export interface ActivityQuery {
  scope: 'smart' | 'region' | 'country' | 'global';
  relationship: 'all' | 'friends' | 'public';
  content: 'all' | 'unread' | 'media';
  query?: string;
  cursor?: string;
  limit: number;
}

export interface ActivityPageDto {
  items: readonly FootprintDto[];
  nextCursor?: string;
  resolvedScope: 'region' | 'country' | 'global';
}

export interface AddCommentInput {
  footprintId: FootprintId;
  content: string;
  parentCommentId?: string;
}
```

Map and Activity return the same `FootprintDto`; scope metadata belongs to the discovery response, not to a second footprint shape.

## Task 1: Add discovery read model and cursor contract

- [ ] Write Postgres tests for public-only, friend-visible, expired, blocked and region-scoped candidates.
- [ ] Add `discovery_entries` with footprint ID, display point, author ID, scope labels, published time and expiry metadata. Treat it as a rebuildable projection, not a second source of truth.
- [ ] Add `activity_cursors` helpers using UUIDv7/published time and opaque base64url cursors with length and signature validation.
- [ ] Implement an Outbox consumer for `FootprintPublished`, `FootprintVisibilityChanged` and deletion events; make replay idempotent.
- [ ] Commit `feat: add discovery read model`.

## Task 2: Implement map discovery and Activity queries

- [ ] Write API tests for `/api/v1/discovery/map` and `/api/v1/activity` covering guest, owner, friend, global/region/country fallback, query text, relationship filters, content filters, expiry and cursor boundaries.
- [ ] Implement `DiscoveryQueryService` with explicit query plans and maximum limits; never fetch all footprints into JavaScript.
- [ ] Implement fallback order: first-level region, country, global. Return the selected source scope in each DTO.
- [ ] Ensure reverse chronological order is strict and friends receive no hidden ranking boost.
- [ ] Add `EXPLAIN` assertions for the map and Activity indexes at the Phase 4 fixture scale.
- [ ] Commit `feat: add public discovery and activity queries`.

## Task 3: Add reactions and two-level comments

- [ ] Write domain tests for one reaction per actor/emoji replacement, chronological top-level comments, reply parent ownership, blocked users, and author/admin deletion.
- [ ] Add tables `reactions`, `comments`, and `comment_replies` or an equivalent two-level model with unique/foreign-key constraints and soft-delete metadata.
- [ ] Implement `AddReaction`, `RemoveReaction`, `AddComment`, `AddReply`, and `DeleteComment` application commands.
- [ ] Emit `ReactionAdded`, `CommentAdded`, `CommentDeleted` Outbox events and update the footprint detail query through invalidation.
- [ ] Add REST resources `/api/v1/footprints/:id/reactions` and `/api/v1/footprints/:id/comments` with content limits and idempotency.
- [ ] Commit `feat: add footprint interaction commands`.

## Task 4: Add reporting intake

- [ ] Write tests for report reason validation, duplicate open report conflict, blocked actor behavior, and anonymous rejection.
- [ ] Add `reports` with reporter, target type/id, reason, status, created/updated timestamps and a unique open-report constraint.
- [ ] Implement `POST /api/v1/reports` as an intake command that does not expose moderation internals.
- [ ] Emit `ReportCreated`; defer resolution UI and admin command to Phase 6.
- [ ] Commit `feat: add moderation report intake`.

## Task 5: Build Activity and interaction Web features

- [ ] Write component tests for Activity loading/empty/error/retry, cursor loading, scope labels, guest login prompts, reaction optimistic state, comments/replies and report confirmation.
- [ ] Implement `ActivityRoute`, `ActivityCard`, `ActivityScopeSheet`, and shared `ConversationSection` using generated API hooks.
- [ ] Make the footprint detail route reusable from Map, Activity and Memories; do not create another modal implementation.
- [ ] Preserve pending guest actions through the auth route and restore them after login.
- [ ] Add Playwright flows for guest discovery, authenticated reaction/comment, reply, report and blocked-content absence.
- [ ] Commit `feat: add V2 discovery and interaction experience`.

## Phase 4 exit gate

Run:

```text
npm.cmd run db:v2:migrate
npm.cmd run typecheck:v2
npm.cmd run lint:v2
npm.cmd run test:v2
npx playwright test apps/web/e2e/discovery-interaction.spec.ts
```

The phase passes only when Map and Activity use identical privacy DTOs, public discovery expires without deleting history, comments are exactly two levels, blocked content is absent from every query, and cursor pagination has no duplicates or gaps in the fixture dataset. Commit `docs/qa/v2-phase-4-discovery-interaction.md` and tag the accepted SHA as `v2-phase-4-discovery-interaction`.
