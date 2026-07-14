# Bliver V2 Complete Execution Roadmap

> **For agentic workers:** This roadmap coordinates the focused plans below. Execute one phase at a time in a dedicated worktree; each phase must pass its exit gate before the next phase starts.

**Goal:** Implement the approved Bliver V2 architecture from a strict TypeScript foundation through a complete product cutover, with every phase independently testable and the old V1 removed only after final acceptance.

**Source of truth:** `docs/superpowers/specs/2026-07-14-bliver-v2-product-architecture-design.md`

**Execution order:**

1. `2026-07-15-bliver-v2-foundation.md`
2. `2026-07-15-bliver-v2-identity-shell.md`
3. `2026-07-15-bliver-v2-map-footprints.md`
4. `2026-07-15-bliver-v2-discovery-interaction.md`
5. `2026-07-15-bliver-v2-social-messaging.md`
6. `2026-07-15-bliver-v2-memories-governance.md`
7. `2026-07-15-bliver-v2-hardening.md`
8. `2026-07-15-bliver-v2-cutover.md`

## Shared rules

- Create a dedicated `codex/bliver-v2-phase-N` branch/worktree for each phase.
- Read the master spec and the current phase plan before editing.
- Write the failing test before the smallest implementation for every behavior.
- Keep domain, application, infrastructure and transport boundaries explicit.
- Add migrations in order; never edit an applied migration.
- Generate OpenAPI and client output from `packages/contracts`; never hand-edit generated files.
- Use UUIDv7, UTC timestamps, opaque cursors and Problem Details consistently.
- Every phase ends with its own QA evidence file and a tagged commit.
- Do not start a later phase in the same worktree as an unfinished earlier phase.
- No plan below authorizes product code changes outside its listed files.

## Cross-phase contract names

| Concept | Canonical name |
|---|---|
| API prefix | `/api/v1` |
| Public event envelope | `EventEnvelope<TType, TPayload>` |
| Error format | RFC 9457 Problem Details with `code` and `requestId` |
| User identity | `UserId` UUIDv7 |
| Footprint visibility | `public | friends | private` |
| Location precision | `precise | approximate` |
| Session transport | HttpOnly Cookie on Web, Bearer token on Capacitor |
| Server state | TanStack Query |
| Cross-route UI state | Minimal Zustand stores plus URL state |
| Database | PostgreSQL + PostGIS through Drizzle |
| Reliable events | PostgreSQL Outbox + idempotent consumers |
| Media | Cloudinary stable asset references |

## Phase dependency graph

```text
Foundation
  -> Identity + App Shell
  -> Map + Footprints
       -> Discovery + Interaction
       -> Social + Messaging
            -> Memories + Notifications + Governance
                 -> Hardening
                      -> Cutover
```

## Shared evidence format

Each phase writes `docs/qa/v2-phase-N-<name>.md` containing:

- commit SHA and branch;
- commands and exit codes;
- test counts and coverage for the phase;
- migration version and PostGIS version where relevant;
- browser viewport and accessibility evidence where relevant;
- known non-blocking warnings;
- rollback commit and next-phase handoff.
