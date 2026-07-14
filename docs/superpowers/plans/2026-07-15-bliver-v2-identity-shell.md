# Bliver V2 Phase 2 Identity and App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-authoritative identity, secure sessions, the V2 route shell, and a working Web/Capacitor authentication boundary on top of the Phase 1 foundation.

**Architecture:** Identity owns users, credentials, sessions, devices and roles. HTTP controllers remain thin and call application handlers. Web stores only session metadata; server state stays in TanStack Query. No footprint, social or messaging behavior is added here.

**Tech Stack:** TypeScript, Express 5, PostgreSQL/PostGIS, Drizzle, Argon2id, Zod/OpenAPI, React Router, TanStack Query, Zustand, Capacitor Secure Storage.

---

## Files and ownership

- Create migration: `apps/api/drizzle/0001_identity.sql`.
- Create module: `apps/api/src/modules/identity/{domain,application,infrastructure,transport}`.
- Create contracts: `packages/contracts/src/auth.ts`, `packages/contracts/src/session.ts`.
- Create web feature: `apps/web/src/features/auth/{api,components,queries,commands,model,tests,index.ts}`.
- Modify shell: `apps/web/src/app/router.tsx`, `apps/web/src/app/providers/SessionProvider.tsx`, `apps/web/src/app/guards/RequireAuth.tsx`.
- Create tests: identity domain/application/API tests, Web auth tests, Socket credential handshake test.
- Create evidence: `docs/qa/v2-phase-2-identity-shell.md`.

## Canonical interfaces

```ts
export type Role = 'user' | 'moderator' | 'admin';

export interface ActorContext {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly roles: readonly Role[];
  readonly transport: 'cookie' | 'bearer';
}

export interface SessionDto {
  id: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
```

All identity commands return DTOs defined in `packages/contracts`; domain entities and token hashes never cross the transport boundary.

## Task 1: Create identity tables and Repository ports

- [ ] Write failing Postgres integration tests for `users`, `credentials`, `sessions`, `devices`, and `roles`.
- [ ] Assert unique username, optional unique email, one hashed credential per user, session token hash uniqueness, revoked-at timestamps, and role membership.
- [ ] Add `0001_identity.sql` with UUIDv7-compatible UUID storage, UTC timestamps, unique constraints and indexes on username/email/session hash.
- [ ] Define `UserRepository`, `CredentialRepository`, `SessionRepository`, `DeviceRepository` ports in `application/ports.ts`; no Drizzle types may escape infrastructure.
- [ ] Implement Drizzle repositories and transaction helpers in `infrastructure/`.
- [ ] Run `npm.cmd exec vitest run --config apps/api/vitest.config.ts apps/api/src/modules/identity` and commit `feat: add identity persistence`.

## Task 2: Implement password and session services

- [ ] Write domain tests for password verification, session expiry, revocation, and device naming.
- [ ] Implement Argon2id hashing with explicit memory/time/parallelism parameters in `domain/password.ts`; never log or return hashes.
- [ ] Implement `CreateSession`, `RotateSession`, `RevokeSession` application commands. Store only a SHA-256 token hash; return the raw token once to the transport adapter.
- [ ] Use 15-minute access validity for Capacitor, 30-day rotating refresh validity, and a server-side HttpOnly session cookie for Web.
- [ ] Add replay detection: a reused refresh token revokes its device session family and writes a structured identity security record without depending on the Phase 3 Outbox.
- [ ] Run focused unit tests and commit `feat: add secure identity sessions`.

## Task 3: Add auth and session contracts

- [ ] Add Zod/OpenAPI schemas for register, login, logout, session list, session revoke, current user and Problem Details authentication errors.
- [ ] Add response DTO mappers that never expose password hashes, refresh tokens, private metadata or internal role records.
- [ ] Regenerate `artifacts/openapi/v2.json` and the typed client; add contract snapshot tests.
- [ ] Commit `feat: publish identity API contracts`.

## Task 4: Add REST identity routes and security middleware

- [ ] Write Supertest tests for `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/session`, `GET /api/v1/users/me`, `GET /api/v1/sessions`, and `DELETE /api/v1/sessions/:sessionId`.
- [ ] Implement controllers that only parse input, call commands, set/clear cookies, and map errors.
- [ ] Add Origin and CSRF validation for cookie mutations; add per-IP and per-identity auth rate limits.
- [ ] Add `requireActor` middleware that resolves either the Web cookie or Capacitor Bearer token into an immutable `ActorContext`.
- [ ] Test invalid credentials, revoked sessions, expired sessions, role changes, CSRF failures, rate limits, and generic error messages.
- [ ] Commit `feat: expose V2 authentication routes`.

## Task 5: Build the Web auth feature and route guards

- [ ] Write React tests for login, registration, logout, loading/error states, session expiry, and redirecting back to an intended route.
- [ ] Implement feature-local `authApi`, `useSessionQuery`, `useLoginCommand`, `useLogoutCommand`, and `AuthPanel`.
- [ ] Keep auth data in TanStack Query; Zustand may store only a pending navigation intent and a dismissible auth surface state.
- [ ] Implement `RequireAuth` as a route element; unauthenticated users retain the target URL and return after login.
- [ ] Add a `PlatformCredentialStore` interface with browser cookie no-op behavior and a Capacitor Secure Storage adapter stub tested behind an interface.
- [ ] Run Web auth tests and commit `feat: add V2 authentication shell`.

## Task 6: Wire the application shell and deep links

- [ ] Add route-level error boundaries and typed route metadata for `/map`, `/activity`, `/messages`, `/me`, `/profile/:userId`, `/footprints/:footprintId`, and `/admin`.
- [ ] Add a 404 route and a session-expired route that preserve the current destination.
- [ ] Make the AppShell expose exactly four navigation destinations and one independent publish action; no feature booleans are added to the root.
- [ ] Add Capacitor deep-link parsing tests for `/footprints/:id` and `/messages/:conversationId`.
- [ ] Commit `feat: add authenticated V2 app shell`.

## Phase 2 exit gate

Run:

```text
npm.cmd run db:v2:migrate
npm.cmd run typecheck:v2
npm.cmd run lint:v2
npm.cmd run test:v2
npm.cmd run build:v2
npm.cmd run smoke:v2 -- --api-url http://localhost:5100 --expected-release local
```

The phase passes only when password hashes and tokens never appear in responses/logs, Web and Capacitor auth paths are tested, all identity tables are migrated from empty Postgres, and `docs/qa/v2-phase-2-identity-shell.md` records evidence. Commit the evidence and tag the accepted SHA as `v2-phase-2-identity-shell`.
