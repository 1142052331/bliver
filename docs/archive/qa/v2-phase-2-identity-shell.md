# V2 Phase 2: Identity and App Shell QA

Date: 2026-07-15

## Scope

- Identity persistence for users, credentials, devices, sessions, roles and security events.
- Argon2id password hashing, SHA-256 token storage, cookie/Bearer actor resolution and refresh replay revocation.
- Zod/OpenAPI auth/session contracts and generated `artifacts/openapi/v2.json` / `packages/contracts/generated/v2.d.ts`.
- Web TanStack Query auth feature, platform credential ports, route metadata/404/session-expired shell.

## Evidence

| Check | Result |
| --- | --- |
| `npm.cmd run db:v2:migrate` with native PostgreSQL/PostGIS | PASS; migration is idempotent and identity tables present |
| Identity Postgres integration with `V2_DATABASE_URL` | PASS; user/credential persistence and unique username constraint |
| PostGIS foundation integration with `V2_DATABASE_URL` | PASS |
| `npm.cmd run typecheck:v2` | PASS |
| `npm.cmd run lint:v2` | PASS |
| `npm.cmd run test:v2` with `V2_DATABASE_URL` | PASS (58 passed across 19 files, including native PostGIS integration) |
| `npm.cmd run build:v2` | PASS |
| `npm.cmd run architecture:check` | PASS; no dependency violations |
| API smoke (`/healthz`, `/readyz`, `/versionz`) | PASS on port 5100 |

## Security assertions

- Password hashes, access tokens and refresh tokens are not returned by Web auth responses or Problem Details.
- Web sessions use `HttpOnly; SameSite=Lax` cookies; cookie mutation requires same-origin and CSRF token validation.
- Capacitor login returns short-lived access plus rotating refresh credentials; replay revokes the device family and records a security event.
- Session lookup rejects revoked and expired records; role membership is read from the identity repository.

## Known limitations

- The Web shell uses placeholder feature routes until later phases implement map, discovery, social, messaging and memory modules.
- Capacitor secure storage is exposed through an adapter port; the native plugin wiring is deferred to the Android synchronization phase.
- The current API smoke verifies readiness endpoints; authenticated smoke remains covered by focused Supertest and integration tests.
