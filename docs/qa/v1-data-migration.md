# V1 Data Migration QA

## Current status

`LOCAL_LOAD_VERIFIED_RENDER_PENDING`

The V1 service is offline. The full Mongo database has been encrypted, restored into the isolated Atlas restore database, and verified by collection counts, canonical BSON hashes and index hashes. No source writes occurred. A fresh local PostgreSQL 16/PostGIS database completed the full serializable load. Render staging has not been loaded and no production cutover is claimed.

## Verified evidence

- Encrypted archive: 49,225 bytes; SHA-256 `18e5da9cf9b44366582c5870a086d8f4430f41375098849e3e288c7214096bf3`; two age recipients; plaintext archive removed.
- Restore: all 15 V1 model collections matched source counts, canonical BSON content hashes and index hashes, with no extra collection.
- Real preflight: `680 source / 486 migrated / 194 archived-only / 0 blocked`.
- Preservation policy: 17 early comment authors recovered by unique username snapshot; four no-credential deleted-user identities; 11 dangling notifications, two dangling push subscriptions and one dangling report retained archive-only; 58 reaction timestamps use their footprint creation time as the documented baseline.
- Media: all 26 referenced Cloudinary images passed cloud, type, ownership and required metadata checks.
- Deterministic plan: 99 users, 95 credentials, 100 footprints, 26 media assets, 59 reactions, 60 comments, eight friendships, 18 conversations, 58 messages, 112 notifications and 11 active push subscriptions; digest `afec46370a0e69e944a2dbc572d84de300771f2d268225419b43e8fa749158d4`.
- Local target: all planned table counts matched before commit; zero unvalidated foreign keys; every identity has the base user role; Outbox, delivery attempts, audit logs and processed events remained zero.
- V2 database gate: `100/100` test files and `396/396` tests passed against PostgreSQL/PostGIS, with zero skips.
- Migration tool gate: `19/19` test files and `42/42` tests passed; TypeScript passed.

## Remaining Render gates

- Confirm the Render target is isolated and empty, apply all eleven migrations, and compare its production-equivalent database fingerprint.
- Confirm the V2 VAPID public key matches the archived V1 key before retaining the 11 active subscriptions.
- Load Render staging once, verify counts and authorized reads, then perform PostgreSQL backup/restore rehearsal.
- Run exact-SHA API, Socket, media and privacy smoke; observe health, errors, latency and Outbox for 60 minutes.
- Revoke the exposed Atlas administrator credential and all temporary migration credentials after acceptance.

Public evidence contains aggregates and hashes only. Connection strings, credentials, password hashes, push endpoints/keys, messages, image URLs, coordinates and source ObjectIds remain excluded.
