# Bliver V2 Architecture

Bliver is a Node.js 24/npm 11 npm workspaces monorepo. `apps/web` is the React/Vite/PWA client and `apps/api` is an Express 5 modular monolith with Socket.IO and an Outbox worker. PostgreSQL 16 with PostGIS is the only source of truth; Drizzle owns ordered migrations.

## Module Ownership

- `packages/contracts`: public DTOs, Problem Details, typed events, OpenAPI.
- `packages/domain`: pure IDs, values, and policies.
- `packages/ui`: accessible feature-independent UI primitives and tokens.
- `apps/api/src/modules/*`: domain/application/infrastructure/transport slices.
- `apps/api/src/platform/*`: database, Outbox, geography, observability, pagination.
- `apps/web/src/features/*`: route-owned browser features.

Web imports public packages, never API source. An API module communicates through ports or another module's public index, never its infrastructure directory. Domain has no framework or platform ownership. `npm run architecture:check` and `npm run verify:v2-foundation` enforce the dependency graph.

## Runtime Flow

The production API process owns one HTTP server. API routes are mounted at `/api/v1`, Socket.IO at `/socket.io`, and health at `/healthz`, `/readyz`, and `/versionz`. Only after those namespaces are registered does Express serve `apps/web/dist` and route-like SPA fallback. Missing assets never return the shell.

Commands append an Outbox event in the same database transaction as state changes. The worker claims events with bounded retry and idempotent consumers for discovery, memories, conversations, notifications, and push delivery. Socket emission is downstream of durable state.

## Data and Security

Migrations in `apps/api/drizzle` enable PostGIS and define identity, footprints/media, Outbox, discovery/interactions, social/conversations, memories, notifications, moderation, and audit. Sessions use secure cookies for Web and bounded bearer flows for Capacitor. Privacy and block policies are applied before repository reads expose rows. Errors use RFC 9457 Problem Details; logs and Sentry exclude bodies, credentials, actor IDs, and precise coordinates.

The release graph is root-lock based. `npm run render-build` verifies SHA identity, emits the API, builds the Web shell, and checks both artifacts. `npm run release:v2:predeploy` verifies the same candidate before migrations; `npm start` runs it. `npm run cutover:v2:check` rejects old runtime roots, direct legacy dependencies, stale environment names, and unversioned API paths.
