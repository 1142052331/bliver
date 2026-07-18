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

## Product and Design North Star

`DESIGN.md` and `docs/superpowers/specs/2026-07-18-spatial-cinema-os-design.md` are the canonical design contract. Read both before changing any user-facing surface, and include these constraints in every frontend sub-agent brief and acceptance review.

- The approved direction is **Natural City x Spatial Cinema OS**: the map is the product and must remain the dominant visual and navigational context whenever place matters.
- Forest green creates order, navigation, and selection. Coral is the single bold color and is reserved for check-in, publish, publish success, and critical attention. It is never decorative.
- Aim for Apple-level restraint and transition quality plus Steam-like large-screen focus clarity, without copying either brand or turning Bliver into a game interface.
- Concentrate cinematic treatment in meaningful spatial moments: map selection, the Chrono Lens, footprint detail, publish success, and memories. Authentication, messaging, notifications, settings, and admin stay quiet, fast, and work-focused.
- Support Simplified Chinese, English, and Japanese as equal product languages. Follow the system locale on first use, then persist the user's explicit choice. No user-facing string may bypass the locale resources.
- Accessibility and graceful degradation are part of the visual standard: 44px targets, visible focus, semantic equivalents for canvas content, reduced motion, WebGL/provider fallbacks, and complete error/empty/offline states may not be sacrificed for spectacle.
- Avoid generic AI styling, decorative gradients or glow, black glass, nested card grids, floating-control clutter, ornamental 3D, and looping motion. Spectacle must come from real map, time, relationship, and media data.
- Treat `390x844` as the canonical mobile canvas, then verify all approved phone, tablet, desktop, and wide-screen viewports for overflow, overlap, focus order, and text stress in all three languages.

When a proposed UI conflicts with this section, revise the proposal rather than silently weakening the product direction. For this single-developer project, prefer a small reusable vocabulary and documented tokens over one-off abstractions that create long-term maintenance burden.

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

Map builds use `VITE_MAP_STYLE_URL` plus structured `VITE_MAP_ATTRIBUTION_JSON`. Routine production releases require the repository-owned same-origin provider gate; emergency fallback approval is explicit and expires within seven days.

No external deploy, tag, observation result, backup result, or provider credential may be inferred. Record unavailable evidence as `BLOCKED` or skipped with its exact reason.

## Working Rules

- Search with `rg` before reading broad files; read only relevant ranges in large modules.
- Use repository patterns and public module interfaces; do not create compatibility bridges.
- Apply migrations only through the ordered files in `apps/api/drizzle`.
- Use focused tests for behavior changes and fresh milestone verification before claiming completion; this single-developer project does not require micro-TDD for every edit.
- Do not invoke Superpowers workflows unless the user explicitly requests them.
- Preserve user changes in a dirty worktree and use absolute-path checks before recursive deletion.
- Canonical instructions are this file, `README.md`, `CLAUDE.md`, and `docs/operations/`; `docs/archive/` is historical only.
