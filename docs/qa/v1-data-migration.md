# V1 Data Migration QA

## Current status

`BLOCKED_SOURCE_ACCESS`

Phase A fixture/tooling work is executable without a real Mongo connection. Phase B is intentionally blocked: the previously supplied V1 environment returned `ECONNREFUSED`, and the effective Mongo database name has not been confirmed. No source records have been read, no BSON archive has been created, no Render service has been changed, and no production cutover is claimed.

## Required evidence before Phase B

- Explicit database-name and read-only/no-write confirmation.
- Encrypted full archive covering all V1 collections and any extras.
- Isolated archive restore with count/index/digest agreement.
- Zero-blocked dry-run and Cloudinary/VAPID metadata checks.
- Fresh PostgreSQL migration/seed, deterministic load, digest and privacy verification.
- PostgreSQL backup restore rehearsal and exact-SHA remote smoke/60-minute observation.

Public evidence may contain only run IDs, candidate SHA, archive/database fingerprints, tool versions, timestamps, aggregate counts and hashes. It must not contain connection strings, secrets, password hashes, push keys/endpoints, message bodies, URLs, coordinates or source ObjectIds.
