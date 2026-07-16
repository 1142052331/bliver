# Bliver V2 Phase 5 Social and Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add friendships, blocks, stranger greetings, unlocked conversations, messages, unread state, typing indicators, and reconnect-safe realtime messaging.

**Architecture:** Social Graph owns friendship/block facts and exposes relationship ports. Conversations owns its state machine and message persistence. Both modules consume Identity actor context and Footprint privacy only through explicit ports. No module reads another module’s tables.

**Tech Stack:** PostgreSQL/Drizzle, Express 5, Socket.IO, Outbox, Zod/OpenAPI, TanStack Query, React Router, Playwright.

---

## Files and ownership

- Create migration: `apps/api/drizzle/0004_social_conversations.sql`.
- Create modules: `apps/api/src/modules/social`, `apps/api/src/modules/conversations`.
- Extend: `apps/api/src/realtime`, `packages/contracts/src/events.ts`, `packages/contracts/src/social.ts`, `packages/contracts/src/conversations.ts`.
- Create Web features: `apps/web/src/features/social`, `apps/web/src/features/conversations`.
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/features/memories` only for link targets once that feature exists.
- Create evidence: `docs/qa/v2-phase-5-social-messaging.md`.

## Canonical interfaces

```ts
export interface RelationshipQueryPort {
  areFriends(left: UserId, right: UserId): Promise<boolean>;
  isBlocked(left: UserId, right: UserId): Promise<boolean>;
  getSummary(actor: UserId, target: UserId): Promise<RelationshipSummaryDto>;
}

export interface RelationshipSummaryDto {
  state: 'none' | 'pending-outgoing' | 'pending-incoming' | 'friends' | 'blocked';
  requestId?: string;
}

export type ConversationState = 'requested' | 'active' | 'ignored' | 'blocked';

export interface MessageDto {
  id: string;
  conversationId: ConversationId;
  senderId: UserId;
  content: string;
  sentAt: string;
  eventId: EventId;
}
```

Conversation commands depend on `RelationshipQueryPort`; they never query Social tables directly.

## Task 1: Model social graph and block policy

- [ ] Write integration tests for canonical friendship pairs, pending/accepted/rejected states, duplicate requests, self-requests, remove friendship, and mutual blocks.
- [ ] Add `friendships` with a canonical pair key and status history; add `blocks` with unique blocker/blocked pair and timestamps.
- [ ] Implement `RelationshipQueryPort` with `areFriends`, `isBlocked`, `getPendingRequest`, and `getRelationshipSummary`.
- [ ] Make `BlockPolicy` a reusable pre-query predicate for profile, footprints, comments, activity, conversations and notifications.
- [ ] Emit `FriendshipRequested`, `FriendshipAccepted`, `FriendshipRemoved`, and `UserBlocked`/`UserUnblocked` events.
- [ ] Commit `feat: add social graph and block policy`.

## Task 2: Expose friendship and block commands

- [ ] Write API tests for request, accept, reject, remove, list, block, unblock and relationship summary endpoints.
- [ ] Implement `/api/v1/friendships`, `/api/v1/friendships/requests`, `/api/v1/friendships/:id/accept`, `/api/v1/friendships/:userId`, `/api/v1/blocks/:userId`.
- [ ] Use actor identity from the session, never a client-supplied name or role.
- [ ] Return generic not-found responses for blocked users to avoid relationship enumeration.
- [ ] Add idempotency for request/accept commands and conflict codes for invalid state transitions.
- [ ] Commit `feat: expose social graph commands`.

## Task 3: Model conversations and messages

- [ ] Write domain tests for `requested -> active`, ignored, blocked, friend direct messaging, one greeting limit, and sender/recipient authorization.
- [ ] Add `conversations`, `conversation_participants`, `messages`, `message_receipts`, and `typing_presence` with unique keys for participant pairs/message idempotency and indexes for conversation history, unread state and expiry.
- [ ] Implement `SendGreeting`, `ReplyToGreeting`, `SendMessage`, `IgnoreConversation`, `HideConversation`, `BlockConversationUser`, and `MarkRead` commands.
- [ ] Store message content with length limits and moderation metadata; never accept sender name from the client.
- [ ] Emit `GreetingSent`, `ConversationUnlocked`, `MessageSent`, `MessageRead`, and `ConversationHidden` events.
- [ ] Commit `feat: add conversation state machine`.

## Task 4: Add REST and Socket messaging transport

- [ ] Write Supertest and Socket.IO client tests for history cursor pagination, greeting restrictions, reply unlock, typing authorization, read receipts, reconnect, and blocked delivery.
- [ ] Add REST resources `/api/v1/conversations`, `/api/v1/conversations/:id/messages`, `/api/v1/users/:id/greetings`, `/api/v1/conversations/:id/reply`, `/api/v1/conversations/:id/read`.
- [ ] Add Socket events `conversation:message`, `conversation:typing`, `conversation:read`, `conversation:presence`; validate every payload with shared schemas.
- [ ] Route socket commands through application handlers; never write directly from a socket callback.
- [ ] Use Outbox event IDs for client deduplication and reconnect resync.
- [ ] Commit `feat: add realtime conversation transport`.

## Task 5: Build Social and Messages Web features

- [ ] Write tests for People/Requests views, relationship actions, blocked states, conversation list, greeting composer, message history, typing and unread indicators.
- [ ] Implement `PeopleRoute`, `FriendRequestList`, `ConversationList`, `ConversationRoute`, `GreetingComposer`, `MessageComposer`, and `MessageSettings` under feature boundaries.
- [ ] Keep conversations addressable at `/messages/:conversationId`; avoid a global `chatUserId` store.
- [ ] Add optimistic message rendering only with an idempotency key and a visible retry state.
- [ ] Add Playwright dual-user scenarios for request/accept, greeting/reply, messaging, unread, block/unblock and forced session revocation.
- [ ] Commit `feat: add V2 social and messaging experience`.

## Phase 5 exit gate

Run:

```text
npm.cmd run db:v2:migrate
npm.cmd run typecheck:v2
npm.cmd run lint:v2
npm.cmd run test:v2
npx playwright test apps/web/e2e/social-messaging.spec.ts
```

The phase passes only when two real Socket clients remain policy-compliant through reconnects, blocked users are mutually invisible across HTTP and Socket, strangers cannot send a second greeting, and all message writes are idempotent. Commit `docs/qa/v2-phase-5-social-messaging.md` and tag the accepted SHA as `v2-phase-5-social-messaging`.
