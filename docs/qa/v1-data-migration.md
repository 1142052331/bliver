# V1 Data Migration QA

## Current status

`BLOCKED_SOURCE_ACCESS`

Phase A fixture/tooling work is executable without a real Mongo connection. Phase B is intentionally blocked: the previously supplied V1 environment returned `ECONNREFUSED`, and the effective Mongo database name has not been confirmed. No source records have been read, no BSON archive has been created, no Render service has been changed, and no production cutover is claimed.

## Phase A evidence

- Candidate SHA: `2724f46ecdb000c1e79232b581afaa1e9a32358d`
- Migration tool: `18 files / 38 tests`, typecheck PASS, production dependency audit PASS (`0 vulnerabilities`)
- Fixture preflight: `31 source / 18 migrated / 13 archived-only / 0 blocked`; one missing-visibility default was counted
- V2 foundation: `97 files passed / 3 existing integration files skipped`; `389 tests passed / 7 existing database-dependent tests skipped`; no new skip introduced by this chapter
- Documentation: `7/7`; release tools: `7/7`; architecture, cutover and exact-SHA `render-build`: PASS
- UUID boundary: deterministic v7 vectors pass existing domain `parseUserId`/`parseFootprintId` and collision checks

The seven skipped V2 tests remain the pre-existing PostgreSQL integration files that require a configured database; they are not represented as Phase B migration evidence.

## Required evidence before Phase B

- Explicit database-name and read-only/no-write confirmation.
- Encrypted full archive covering all V1 collections and any extras.
- Isolated archive restore with count/index/digest agreement.
- Zero-blocked dry-run and Cloudinary/VAPID metadata checks.
- Fresh PostgreSQL migration/seed, deterministic load, digest and privacy verification.
- PostgreSQL backup restore rehearsal and exact-SHA remote smoke/60-minute observation.

Public evidence may contain only run IDs, candidate SHA, archive/database fingerprints, tool versions, timestamps, aggregate counts and hashes. It must not contain connection strings, secrets, password hashes, push keys/endpoints, message bodies, URLs, coordinates or source ObjectIds.
