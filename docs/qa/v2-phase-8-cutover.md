# V2 Phase 8 QA: Cutover and V1 Removal

Date: 2026-07-16  
Branch: `codex/bliver-v2-phase-8`  
Freeze source: `8aa34867ceefbb296721392cd5dda4b7a8dcd00b`  
Status: `IN_PROGRESS`; feature changes are frozen after Task 1.

## Acceptance exception and risk

The user explicitly authorized Phase 8 to start from exact SHA `8aa34867ceefbb296721392cd5dda4b7a8dcd00b` without a Phase 7 tag. This is an accepted sequencing exception, not evidence that the missing Phase 7 external gates passed. At freeze time there was no live PostGIS candidate evidence, backup/restore exercise, Render deployment, exact remote `/versionz` result, or remote observation window. Those items remain release blockers. No Phase 7 tag, `v2.0.0` tag, remote deployment, or observation result is claimed.

Task 1 ran the complete local Phase 7 gate twice. Both passes returned exit 0, Vitest reported 187 passed suites, 349 passed tests and 7 skipped tests, and the generated OpenAPI document had 40 paths with SHA-256 `a30db6c6b1be71a5f71d5cef47ab3c78188292612d51303d630e4a1fe725d37c`. The canonical evidence is `artifacts/release/phase-7-freeze.json`; candidate file hashes are in `artifacts/release/v2-candidate-manifest.json`.

## V1 deletion inventory

Inventory command: `npm run legacy:v1:inventory`  
Boundary command: `npm run legacy:v2:check`  
Boundary result before deletion: `PASS`, no code or package under `apps/` or `packages/` imports or depends on V1.

### Runtime roots and locks

| Root | Git-tracked files | Ownership | Deletion disposition |
| --- | ---: | --- | --- |
| `frontend/` | 182 | V1 React/Vite application, tests, `package.json`, lock, public assets | delete entire root |
| `backend/` | 123 | V1 Express/Mongoose/JWT/Socket application, tests, Mongo models/config, backfill scripts, `package.json`, lock | delete entire root |

Untracked `node_modules`, `dist`, and coverage output under these roots are not release inputs and are removed with their parent roots. The root workspace lock remains and is regenerated after deletion.

### Root, deployment, CI, and mobile references

- Root `package.json`: `dev`, `dev:frontend`, `dev:backend`, `start`, and `render-build` invoke `frontend/` or `backend/`; `verify:release`, `smoke:release`, and `test:release-tools` own the old release graph.
- Root V1 release files: `scripts/verify-release.mjs`, `scripts/verify-release.test.mjs`, `scripts/release-smoke.mjs`, `scripts/release-smoke.test.mjs`, `scripts/release-tool-config.test.mjs`.
- `.github/workflows/ci.yml`: separate `backend`, `frontend`, and V1 `release` jobs cache child locks and require V1 build output.
- `render.yaml`: V1 root build/start plus `MONGODB_URI`, `JWT_SECRET`, `ADMIN_SETUP_SECRET`, old weather/frontend env and V1 build path.
- `capacitor.config.json`: already points at `apps/web/dist` and HTTPS; it still names the existing Render origin and must be verified against the V2 same-origin process.
- `android/`: no `frontend/`, `backend/`, MongoDB, JWT, or legacy bridge path was found. `build_android.bat` only enters `android/` and invokes Gradle.

### V1 packages

The union of V1 dependencies and dev dependencies is frozen below. Shared package names are not blindly removed from the root lock: the root workspace determines whether V2 still owns them. V1-only packages disappear when no V2 workspace owns them.

```text
@eslint/js, @sentry/node, @sentry/react, @tailwindcss/vite,
@tanstack/react-query, @testing-library/jest-dom, @testing-library/react,
@testing-library/user-event, @types/react, @types/react-dom,
@vitejs/plugin-react, axios, bcryptjs, browser-image-compression, cloudinary,
cors, dotenv, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh,
express, express-rate-limit, framer-motion, globals, helmet, jest, jsdom,
jsonwebtoken, leaflet, leaflet.markercluster, lucide-react,
mongodb-memory-server, mongoose, multer, react, react-dom, react-leaflet,
react-leaflet-cluster, react-router-dom, socket.io, socket.io-client,
supertest, tailwindcss, typescript, typescript-eslint, vite, vitest, web-push,
zod, zustand
```

Mongo/JWT-specific deletion targets are `mongoose`, `mongodb-memory-server`, `jsonwebtoken`, the Mongo models/config/database tests, JWT auth middleware, Mongo backfills, and the founder/admin Mongo scripts. V2 continues to own Postgres/Drizzle, session/cookie auth, and any shared dependencies declared by root workspaces.

### V1 environment names

```text
ADMIN_SETUP_SECRET, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_FOLDER, DEPLOY_ENV, DOTENV_CONFIG_QUIET,
JWT_SECRET, MODE, MONGODB_URI, NODE_ENV, OPENWEATHERMAP_API_KEY, PORT,
RELEASE_SHA, RENDER_GIT_COMMIT, SENTRY_DSN, VAPID_PRIVATE_KEY,
VAPID_PUBLIC_KEY, VITE_API_URL, VITE_DEPLOY_ENV, VITE_OWM_API_KEY,
VITE_RELEASE_SHA, VITE_SENTRY_DSN, VITE_SOCKET_URL
```

The cutover retains only V2-owned names: `NODE_ENV`, `DEPLOY_ENV`, `PORT`, `RELEASE_SHA`, `DATABASE_URL`, `SESSION_SECRET`, the three `CLOUDINARY_*` credentials, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `SENTRY_DSN`. Same-origin production removes API/Socket URL overrides. Test-only `V2_DATABASE_URL` is not a deployment variable.

### V1 REST and health contract

All routes below are mounted by the V1 runtime. They are inventory, not compatibility requirements; V2 remains under `/api/v1`.

```text
DELETE /api/admin/users/:id
DELETE /api/conversations/:conversationId
DELETE /api/footprints/:footprintId/comments/:commentId
DELETE /api/footprints/:id
DELETE /api/friends/:userId
DELETE /api/users/:userId/block
GET /api/activity
GET /api/admin/audit
GET /api/admin/clones
GET /api/admin/feedback
GET /api/admin/online
GET /api/admin/reports
GET /api/admin/users
GET /api/announcements
GET /api/auth/me
GET /api/conversations
GET /api/conversations/:conversationId/messages
GET /api/footprints/:id
GET /api/footprints/today
GET /api/friends
GET /api/friends/requests
GET /api/map/footprints
GET /api/map/search
GET /api/me/message-settings
GET /api/messages/:friendId
GET /api/notifications
GET /api/push/vapid-public-key
GET /api/users/:id/profile
GET /healthz
GET /readyz
GET /versionz
PATCH /api/me/message-settings
POST /api/admin/kick/:userId
POST /api/admin/setup
POST /api/announcements
POST /api/auth/login
POST /api/auth/register
POST /api/checkin
POST /api/conversations/:conversationId/ignore
POST /api/conversations/:conversationId/messages
POST /api/conversations/:conversationId/reply
POST /api/feedback
POST /api/footprints/:id/comment
POST /api/footprints/:id/react
POST /api/footprints/read-state/import
POST /api/friends/accept/:friendshipId
POST /api/friends/reject/:friendshipId
POST /api/friends/request/:userId
POST /api/map/location-context
POST /api/messages/:friendId
POST /api/push/subscribe
POST /api/push/unsubscribe
POST /api/reports
POST /api/users/:id/profile/comment
POST /api/users/:id/profile/react
POST /api/users/:userId/block
POST /api/users/:userId/greetings
POST /api/users/profile/banner
PUT /api/admin/reports/:id
PUT /api/admin/users/:id
PUT /api/footprints/:id/read
PUT /api/notifications/:id/read
PUT /api/users/profile
```

### V1 Socket and event contract

```text
connection, disconnect, footprint:deleted, footprint:new, footprint:updated,
force_logout, friend:offline, friend:online, message:error, message:sent,
new_notification, online:count, profile:updated, receive_message, send_message,
stop_typing, typing, user:online, user_offline, user_online
```

The V1 `window.dispatchEvent(CustomEvent)` bridge and `ws:` conventions are deletion targets. V2 uses typed Socket.IO/Outbox contracts and does not import `ProfileDrawer`, `ClusterDetailPanel`, `TimelineDrawer`, or `LegacyDestinationBridge`.

### V1 assets

```text
frontend/public/favicon.svg
frontend/public/icons.svg
frontend/public/marker-icon.png
```

V2 PWA icons, manifest, service worker, built chunks, and Leaflet runtime assets under `apps/web` are independently owned and remain.

### Documentation references

Twenty-six Markdown files mention V1 paths/contracts. Canonical files requiring Phase 8 rewrite are `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture/v2-foundation.md`, `docs/operations/v2-local-development.md`, `docs/operations/deploy.md`, `docs/operations/rollback.md`, `docs/operations/backup-restore.md`, and `docs/release/eight-phase-release-runbook.md`. Earlier QA checklists, design specs, and implementation plans are historical evidence; Task 5 moves stale V1 material beneath an explicit archive boundary or deletes it. `docs/qa/v2-phase-7-hardening.md` remains unchanged as historical fact.

## Task evidence

| Task | Evidence | Result |
| --- | --- | --- |
| 1 freeze | `npm run release:v2:freeze` | PASS twice; local external gaps remain |
| 2 inventory | `npx vitest run scripts/release/legacy-boundary.test.ts` | PASS, 3/3 |
| 2 boundary | `npm run legacy:v2:check` | PASS before deletion |
| 3 focused contracts | `npx vitest run apps/api/src/http/__tests__/static-web.test.ts scripts/release/candidate.test.ts scripts/release/deployment-cutover.test.ts apps/api/src/bootstrap/__tests__/config.test.ts` | PASS, 11/11 |
| 3 root release tools | `node --test scripts/release-smoke.test.mjs scripts/release-tool-config.test.mjs` | PASS, 7/7 |
| 3 V2 gate | `npm run verify:v2-foundation` | PASS, 93 files passed / 3 skipped; 363 tests passed / 7 skipped |
| 3 candidate build | `RELEASE_SHA=<HEAD>; RENDER_GIT_COMMIT=<HEAD>; npm run render-build` | PASS; SHA checked before build, API/Web outputs present, candidate rechecked |
| 3 negative identity | mismatched `RENDER_GIT_COMMIT` with `npm run release:v2:verify-sha` | EXPECTED BLOCK, exit 1 before build or database write |
| 3 mobile | `npm run cap:v2:smoke` | PASS, 6 Vitest + 1 Playwright + Android sync |

Later task results are appended only after the corresponding commands run.

The first Task 3 candidate-build attempt exposed that the inherited TypeScript configuration set `noEmit: true`, so the API “build” had produced no server artifact. The final candidate check blocked on missing `apps/api/dist/bootstrap/server.js`. A dedicated production `apps/api/tsconfig.build.json` was added; a fresh build then emitted the expected server and the complete ordered candidate command passed. No migration was attempted during either build.
