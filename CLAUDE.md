# Bliver Repository Guide

The active application is a strict TypeScript npm workspaces monorepo on Node.js 24 and npm 11. `apps/web` owns React/Vite browser behavior; `apps/api` owns Express 5, Socket.IO, PostGIS, sessions, Outbox processing, and the production same-origin server. Shared code belongs in focused `packages/*` modules.

PostgreSQL with PostGIS is the only application source of truth. Drizzle migrations under `apps/api/drizzle` are ordered and forward-only. Browser calls use `/api/v1`; Socket.IO uses `/socket.io`; release probes use `/healthz`, `/readyz`, and `/versionz`.

## Boundaries

- Web consumes `@bliver/contracts`, `@bliver/domain`, and `@bliver/ui`, never API internals.
- API modules depend on application ports and public module exports, never another module's infrastructure.
- `packages/domain` stays independent of HTTP, SQL, DOM, and environment state.
- Runtime configuration is parsed once in `apps/api/src/bootstrap/config.ts`.
- Production serves `apps/web/dist` only after API, Socket, and health namespaces are reserved.

## Development

```powershell
npm.cmd ci
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run db:v2:seed
npm.cmd run dev
npm.cmd run verify:v2-foundation
npm.cmd run cutover:v2:check
```

Use `npx.cmd playwright test` for full browser behavior. Release gates also include isolated browser performance, Lighthouse, security, Capacitor smoke, exact candidate verification, and `git diff --check`.

Production names are `DATABASE_URL`, `SESSION_SECRET`, `RELEASE_SHA`, Cloudinary credentials, VAPID keys and subject, `SENTRY_DSN`, `NODE_ENV`, `DEPLOY_ENV`, and `PORT`. Never expose values in logs, tests, artifacts, or documentation. A production `RELEASE_SHA` is exactly 40 lowercase hex characters and must match Git HEAD plus `RENDER_GIT_COMMIT` when present.

## Evidence Discipline

Search before asserting repository facts. Distinguish static checks from live PostGIS, provider, browser, Android, backup/restore, remote deploy, and observation evidence. Do not claim a tag or external action without executing it. The release may be locally ready while external promotion remains `BLOCKED`.

Prefer narrow reads, focused files, TDD for behavior, and fresh verification. Historical plans and prior phase QA under `docs/archive/` explain earlier decisions but do not override canonical code or runbooks.
