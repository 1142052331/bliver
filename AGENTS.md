# Bliver Engineering Instructions

Bliver is a Node.js 24/npm 11 npm workspaces monorepo. The current runtime is React/Vite in `apps/web`, Express/Socket.IO in `apps/api`, and PostgreSQL/PostGIS through Drizzle. HTTP is same-origin and versioned under `/api/v1`.

## Ownership

- `apps/web`: routes, browser state, feature UI, PWA, same-origin HTTP and Socket clients.
- `apps/api`: bootstrap, HTTP/Socket transports, application services, PostGIS adapters, Outbox worker.
- `packages/contracts`: public Zod DTOs, event envelopes, Problem Details, OpenAPI.
- `packages/domain`: pure values and policies only.
- `packages/ui`: feature-independent Natural City UI primitives.
- `scripts`: release, clean cutover, performance, security, and mobile verification.

Web never imports API internals. One API module never imports another module's infrastructure. Domain code never owns HTTP, database, browser, or environment concerns. Run `npm run architecture:check` after boundary changes.

## Commands

```powershell
npm.cmd ci
npm.cmd run db:v2:up
npm.cmd run db:v2:migrate
npm.cmd run db:v2:seed
npm.cmd run dev
npm.cmd run verify:v2-foundation
npx.cmd playwright test
npm.cmd run cutover:v2:check
```

Release verification adds `perf:v2:browser-evidence`, `lighthouse:v2`, `perf:v2`, `security:v2`, `cap:v2:smoke`, and `git diff --check`. Production build/start are `npm run render-build`, `npm run release:v2:predeploy`, and `npm start`.

## Environment and Release

Production uses `DATABASE_URL`, `SESSION_SECRET`, exact `RELEASE_SHA`, Cloudinary credentials, VAPID keys/subject, `SENTRY_DSN`, `NODE_ENV`, `DEPLOY_ENV`, and `PORT`. Never print or commit values. Candidate verification must run before a migration or any other database write. `/healthz`, `/readyz`, and `/versionz` must report the same release; API routes use `/api/v1` and Socket.IO uses `/socket.io`.

No external deploy, tag, observation result, backup result, or provider credential may be inferred. Record unavailable evidence as `BLOCKED` or skipped with its exact reason.

## Working Rules

- Search with `rg` before reading broad files; read only relevant ranges in large modules.
- Use repository patterns and public module interfaces; do not create compatibility bridges.
- Apply migrations only through the ordered files in `apps/api/drizzle`.
- Use TDD for behavior changes and run fresh verification before claiming completion.
- Preserve user changes in a dirty worktree and use absolute-path checks before recursive deletion.
- Canonical instructions are this file, `README.md`, `CLAUDE.md`, and `docs/operations/`; `docs/archive/` is historical only.
