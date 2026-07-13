# Stranger Messaging And Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-aware stranger greetings, reply-to-unlock conversations, message preferences, blocking, and conversation-first messaging while preserving existing friend chat behavior.

**Architecture:** Add `Conversation` and `Block` persistence, extend `Message` with conversation/kind metadata, and route every message/profile/content decision through one `InteractionPolicy`. Expose HTTP mutations and Socket events from services that perform conditional writes, then migrate the frontend message entry to React Query-backed conversation/request surfaces while keeping the existing chat window for unlocked threads.

**Tech Stack:** Express, Mongoose, Jest/Supertest, Socket.IO v4, React 18, React Query, Zustand, Tailwind/CSS tokens, Vitest, Testing Library.

---

## File Map

- Create: `backend/models/Conversation.js`, `backend/models/Block.js`, `backend/services/InteractionPolicy.js`, `backend/services/ConversationService.js`, `backend/routes/conversations.js`.
- Modify: `backend/models/Message.js`, `backend/models/User.js`, `backend/routes/messages.js`, `backend/routes/friends.js` only where shared message behavior must delegate, `backend/socket/index.js`, `backend/index.js`.
- Test: `backend/__tests__/interaction-policy.test.js`, `backend/__tests__/conversation-service.test.js`, `backend/__tests__/conversation-http.test.js`, `backend/__tests__/conversation-socket.test.js`.
- Modify frontend: `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/hooks/useFriends.js`, `frontend/src/components/FriendsPanel.jsx`, `frontend/src/components/ChatWindow.jsx`, `frontend/src/components/ProfileDrawer.jsx`, `frontend/src/components/FootprintDetailModal.jsx`, `frontend/src/components/ProfilePage.jsx`, `frontend/src/styles/tokens.css`.
- Create frontend: `frontend/src/hooks/useConversations.js`, `frontend/src/components/StrangerGreetingCard.jsx`, `frontend/src/components/MessageSettings.jsx`, and focused tests under `frontend/src/components/__tests__/` and `frontend/src/hooks/__tests__/`.

### Task 1: InteractionPolicy contract

**Files:** Create `backend/services/InteractionPolicy.js`; test `backend/__tests__/interaction-policy.test.js`.

- [ ] Write failing unit tests for self, accepted friend, public stranger, private/friends-only content, disabled stranger messages, and either-direction blocks. Assert `canViewProfile`, `canViewContent`, `canSendGreeting`, `canSendText`, and `canReadConversation` return explicit `{ allowed, reason }` values.
- [ ] Run `npm test -- --runInBand backend/__tests__/interaction-policy.test.js` from `backend`; verify the module is missing or tests fail on undefined policy methods.
- [ ] Implement policy helpers that load `User`, `Friendship`, and `Block`, apply block first, then self/friend, then visibility/stranger preference, and accept IDs as strings or ObjectIds.
- [ ] Run the focused suite and commit `test: define interaction policy contract` plus `feat: enforce interaction policy decisions` as two small commits if the repository workflow permits.

### Task 2: Conversation, Block, Message, and User persistence

**Files:** Create `backend/models/Conversation.js`, `backend/models/Block.js`; modify `backend/models/Message.js`, `backend/models/User.js`; test in `backend/__tests__/conversation-service.test.js`.

- [ ] Add failing model/service tests for canonical user-pair keys, unique blocks, greeting/text kinds, default `allowStrangerMessages: true`, per-user hidden timestamps, and unlocked state.
- [ ] Run the focused tests to confirm the new fields/models are absent.
- [ ] Implement schemas and indexes: canonical pair unique index on Conversation, conversation/time index on Message, receiver/read index retained, and blocker/blocked unique index on Block. Keep existing Message fields backward-compatible by allowing legacy messages to be associated lazily.
- [ ] Run the model tests and commit `feat: add conversation and block persistence`.

### Task 3: ConversationService state machine

**Files:** Create `backend/services/ConversationService.js`; modify `backend/services/MessageService.js`; test `backend/__tests__/conversation-service.test.js`.

- [ ] Write failing tests for greeting creation, repeated greeting after ignore, recipient-only reply unlocking, friend direct text, forbidden stranger text, current-user delete hiding, new-message resurfacing, and blocked conversation reads.
- [ ] Run focused tests and capture the expected failures.
- [ ] Implement `list`, `history`, `createGreeting`, `ignoreGreeting`, `replyAndUnlock`, `sendText`, `hideForUser`, `blockUser`, and `unblockUser`. Use conditional updates/transactions for pending-to-unlocked and pair creation; preserve existing friend `MessageService` entry points by delegating to the service.
- [ ] Run conversation service tests, then commit `feat: implement conversation state transitions`.

### Task 4: HTTP routes and settings

**Files:** Create `backend/routes/conversations.js`; modify `backend/routes/messages.js`, `backend/index.js`; test `backend/__tests__/conversation-http.test.js`.

- [ ] Add failing Supertest cases for all endpoints in the spec: list/history, greeting, reply, ignore, send text, delete, block/unblock, and `GET/PATCH /api/me/message-settings`, including 403/409 cases.
- [ ] Run the HTTP suite to verify route 404s or incorrect authorization.
- [ ] Wire routes through `auth`, validation/rate limiting where message content is accepted, and `ConversationService`; return stable JSON shapes `{ conversation }`, `{ conversations }`, `{ messages, hasMore }`, `{ user }`, or `{ error }`.
- [ ] Run backend conversation HTTP tests and the existing message/friend suites; commit `feat: expose stranger messaging and blocking APIs`.

### Task 5: Socket authorization and cache events

**Files:** Modify `backend/socket/index.js`; test `backend/__tests__/conversation-socket.test.js`.

- [ ] Write failing tests that attempt greeting/reply/text through Socket.IO, assert blocked users receive no events, and assert failed sends emit only an error to the sender.
- [ ] Run the focused socket suite and confirm current friend-only behavior does not satisfy the new cases.
- [ ] Add event handlers for `message:greeting`, `message:reply`, `message:new`, `conversation:updated`, `conversation:blocked`, and `conversation:unblocked`; call `ConversationService` before broadcasting and preserve existing `receive_message` compatibility for unlocked friend chat during migration.
- [ ] Run socket and existing footprint socket suites; commit `feat: authorize conversation socket events`.

### Task 6: Frontend API and query state

**Files:** Modify `frontend/src/api.js`, `frontend/src/hooks/useFriends.js`; create `frontend/src/hooks/useConversations.js`; tests `frontend/src/hooks/__tests__/useConversations.test.jsx`.

- [ ] Write failing tests for query keys, greeting/reply/ignore mutations, settings toggle, block/unblock invalidation, hidden conversation removal, and Socket event cache updates.
- [ ] Run the focused Vitest suite to verify missing API/query exports.
- [ ] Add typed API methods and a hook exposing conversations, pending greetings, history, and mutations. Invalidate `conversations`, `conversation/:id`, profile, footprint, activity, and comment keys on block/unblock; never infer authorization client-side.
- [ ] Run the focused frontend tests and commit `feat: add conversation query state`.

### Task 7: Stranger greeting and request UI

**Files:** Create `frontend/src/components/StrangerGreetingCard.jsx`, `frontend/src/components/MessageSettings.jsx`; modify `frontend/src/components/FriendsPanel.jsx`, `frontend/src/components/ProfileDrawer.jsx`, `frontend/src/components/FootprintDetailModal.jsx`, `frontend/src/components/ProfilePage.jsx`; tests in corresponding `__tests__` files.

- [ ] Write failing component tests for the bottom-drawer “发问候” action, pending state, request card reply/ignore/block controls, settings switch, and 44px accessible controls.
- [ ] Run the focused component tests to verify the new controls are absent.
- [ ] Implement the Natural City treatment using existing tokens: greeting stays inline in the footprint detail drawer; request cards are separate from unlocked conversations; profile/footprint safety actions remain visible; settings mutations show pending/success/error states.
- [ ] Run focused component tests at mobile-oriented render widths and commit `feat: add stranger greeting surfaces`.

### Task 8: Conversation-first Messages surface and ChatWindow integration

**Files:** Modify `frontend/src/App.jsx`, `frontend/src/components/FriendsPanel.jsx`, `frontend/src/components/ChatWindow.jsx`, `frontend/src/components/MessageBubble.jsx`, `frontend/src/styles/tokens.css`; tests `frontend/src/components/__tests__/FriendsPanel.test.jsx`, `frontend/src/components/__tests__/ChatWindow.test.jsx`, `frontend/src/__tests__/App.mobile-shell.test.jsx`.

- [ ] Add failing tests for pending conversations without a composer, unlocked conversations opening ChatWindow, delete hiding only the current list, block closing the surface, and Socket event-driven cache refresh.
- [ ] Run focused tests to verify current friend-only assumptions fail.
- [ ] Render conversation list/request sections, pass conversation IDs into history/send actions, preserve existing friend unread behavior, and add empty/loading/error states with keyboard focus and reduced-motion-safe transitions.
- [ ] Run focused frontend tests and commit `feat: integrate conversation-first messages surface`.

### Task 9: Regression, visual acceptance, and documentation

**Files:** Modify `frontend/src/styles/tokens.css` only for necessary shared states; create `docs/qa/stranger-messaging-blocking-checklist.md`.

- [ ] Run backend tests, frontend tests, typecheck, production build, and `git diff --check`; record exact commands and results in the checklist.
- [ ] Start the dev server and inspect 360x800, 390x844, 430x932, and 1440x1000 for drawer hierarchy, long names/messages, keyboard focus, reduced motion, pending requests, blocked state, unblock recovery, offline retry, and empty conversations.
- [ ] Fix only issues found by the acceptance pass, rerun the affected tests, and record remaining non-blocking warnings.
- [ ] Commit `test: verify stranger messaging and blocking acceptance`; leave the branch current and do not push, deploy, merge main, or run geographic backfill.

## Self-review

- Spec coverage: product rules are covered by Tasks 1-3; HTTP/Socket contracts by Tasks 4-5; frontend interactions and Natural City styling by Tasks 6-8; verification constraints by Task 9.
- Placeholder scan: no TODO/TBD steps; each task specifies files, failing tests, implementation behavior, commands, and commit boundaries.
- Type consistency: `ConversationService` is the only owner of state transitions; the frontend hook uses the same conversation IDs and event names defined in Tasks 4-6; `allowStrangerMessages` is shared by User schema, settings API, and MessageSettings.
