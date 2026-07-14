# Bliver V2 Foundation

V2 is a strict TypeScript npm workspaces monorepo on Node.js 24.

## Ownership

- `apps/web`: React/Vite route shell and future feature slices.
- `apps/api`: Express 5 modular monolith, transport adapters, and platform lifecycle.
- `packages/contracts`: Zod DTOs, Problem Details, event envelopes, and OpenAPI generation.
- `packages/domain`: pure values and policies; no HTTP, database, DOM, or environment access.
- `packages/ui`: Natural City tokens and accessible, feature-agnostic primitives.
- `packages/config`: shared TypeScript, ESLint, and Vitest configuration.
- `packages/testing`: cross-workspace test setup and fixtures.

PostgreSQL + PostGIS is the single source of truth. Drizzle migrations are append-only and must be
safe to run repeatedly. The API publishes typed health, readiness, and version responses at
`/healthz`, `/readyz`, and `/versionz`; errors use RFC 9457 Problem Details.

## Boundaries

Web may consume public contracts, domain policies, and UI primitives, but never API internals. API
may consume contracts and domain policies, but never Web or UI feature implementations. Domain stays
platform-independent. The architecture checker and `npm run verify:v2-foundation` enforce these rules.

The `frontend/` and `backend/` trees are frozen V1 reference/runtime code until Phase 8. They are not
workspace packages and are intentionally excluded from V2 dependency checks.
