# Bliver Eight-Phase Release Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden, verify, deploy, and sign off the completed eight-phase Bliver refactor on Node 24 through an isolated Render candidate and the production service.

**Architecture:** Database-backed identity and roles replace display-name authorization, while versioned JWT sessions are hydrated on every HTTP and Socket request. A reproducible Node 24 build produces one Express-hosted frontend/backend artifact whose liveness, readiness, and release SHA are machine-verifiable. The same immutable SHA advances from candidate to production, followed by canary writes and cursor-based, single-runner geography backfill.

**Tech Stack:** Node.js 24.16, Express 5, Mongoose 9, Socket.IO 4, React 19, Vite 8, Vitest 4, Jest 30, Render, MongoDB Atlas, GitHub Actions.

---

## File Map

- `backend/config/auth.js`: JWT secret and session constants without middleware cycles.
- `backend/services/SessionService.js`: issue, verify, and hydrate versioned sessions.
- `backend/services/UserIdentityPolicy.js`: founder identity and reserved-name rules.
- `backend/models/User.js`: `sessionVersion` and unique sparse `systemIdentity`.
- `backend/middleware/auth.js`: canonical DB-backed HTTP principals.
- `backend/socket/index.js`: canonical DB-backed Socket principals.
- `backend/services/AuthService.js`, `AdminService.js`, `ProfileService.js`: remove name-derived privilege and revoke sessions after sensitive changes.
- `backend/services/SuperuserPolicy.js`, `FriendsService.js`, `FootprintService.js`, `backend/routes/announcements.js`: role/system-identity authorization.
- `frontend/src/auth.js`, `frontend/src/components/AuthModal.jsx`: remove reversible password storage and keep only session persistence.
- `.nvmrc`, three `package.json`/lockfiles, `.github/workflows/ci.yml`: Node 24 and reproducible dependency contract.
- `render.yaml`, `backend/.env.example`, `frontend/.env.example`, `frontend/.env.production`: candidate deployment and same-origin environment contract.
- `backend/services/runtimeStatus.js`, `backend/index.js`: liveness, readiness, version, and shutdown behavior.
- `scripts/verify-release.mjs`, `scripts/release-smoke.mjs`, `backend/scripts/backfill-report.js`: repeatable release gates and read-only evidence.
- `docs/release/eight-phase-release-runbook.md`, `docs/qa/eight-phase-release-checklist.md`: exact rollout, stop, rollback, and final evidence.

### Task 1: Canonical versioned sessions

**Files:**
- Create: `backend/config/auth.js`
- Create: `backend/services/SessionService.js`
- Create: `backend/__tests__/auth-middleware.test.js`
- Modify: `backend/models/User.js`
- Modify: `backend/middleware/auth.js`
- Modify: `backend/services/AuthService.js`
- Modify: `backend/socket/index.js`
- Modify: `backend/__tests__/auth.test.js`

- [ ] **Step 1: Write failing HTTP session tests**

Add cases that sign a token at `sessionVersion: 0`, then prove a deleted user, a DB-demoted admin, and a user whose `sessionVersion` becomes `1` are rejected. Also prove a DB rename replaces the stale JWT name:

```js
test('hydrates role and name from the database instead of trusting JWT claims', async () => {
  const user = await User.create({ name: 'before', password: 'hash', role: 'admin' });
  const token = signLegacyToken(user, { name: 'stale', role: 'user' });
  user.name = 'after';
  await user.save();
  const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({ name: 'after', role: 'admin' });
});

test('rejects a revoked session version', async () => {
  const { user, token } = await createSessionUser();
  await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm.cmd test --prefix backend -- --runInBand auth.test.js auth-middleware.test.js`  
Expected: failures show JWT role/name are trusted and session version is absent.

- [ ] **Step 3: Add the persistence and session contract**

Add these model fields:

```js
systemIdentity: { type: String, enum: ['asen'], unique: true, sparse: true },
sessionVersion: { type: Number, default: 0, min: 0 },
```

Implement `SessionService` with this public interface:

```js
function issueToken(user) {
  return jwt.sign({ id: user.id, sessionVersion: user.sessionVersion || 0 }, JWT_SECRET, { expiresIn: '30d' });
}

async function hydrateToken(token) {
  const claims = jwt.verify(token, JWT_SECRET);
  const user = await User.findById(claims.id).select('name role sessionVersion systemIdentity');
  if (!user || (claims.sessionVersion || 0) !== (user.sessionVersion || 0)) {
    throw new AppError(401, 'Invalid session');
  }
  return { id: user.id, name: user.name, role: user.role, systemIdentity: user.systemIdentity || null };
}
```

`auth` must reject invalid principals, `optionalAuth` must allow a missing header but reject an invalid supplied bearer token, and `admin` must inspect only the hydrated `req.user.role`.

- [ ] **Step 4: Hydrate Socket principals**

Make Socket middleware async, call the same `hydrateToken`, set `socket.userId`, `socket.user`, and join the canonical user room only after hydration. A deleted/version-revoked user must receive `connect_error`.

- [ ] **Step 5: Remove name-based mutation from login and me**

`AuthService.login` and `getMe` must never change `role`. Replace direct `jwt.sign` calls with `issueToken`; keep legacy tokens without `sessionVersion` compatible with DB version `0` during rollout.

- [ ] **Step 6: Run focused and full backend suites**

Run:

```powershell
npm.cmd test --prefix backend -- --runInBand auth.test.js auth-middleware.test.js
npm.cmd test --prefix backend -- --runInBand
```

Expected: focused tests and all backend suites pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/config/auth.js backend/services/SessionService.js backend/models/User.js backend/middleware/auth.js backend/services/AuthService.js backend/socket/index.js backend/__tests__/auth.test.js backend/__tests__/auth-middleware.test.js
git commit -m "fix: make sessions database authoritative"
```

### Task 2: Founder identity, reserved names, and one-time bootstrap

**Files:**
- Create: `backend/services/UserIdentityPolicy.js`
- Create: `backend/models/AdminBootstrap.js`
- Create: `backend/scripts/migrate-founder-identity.js`
- Create: `backend/__tests__/admin-bootstrap.test.js`
- Create: `backend/__tests__/profile-auth.test.js`
- Modify: `backend/validators/schemas.js`
- Modify: `backend/services/AuthService.js`
- Modify: `backend/services/AdminService.js`
- Modify: `backend/services/ProfileService.js`
- Modify: `backend/services/SuperuserPolicy.js`
- Modify: `backend/services/FriendsService.js`
- Modify: `backend/services/FootprintService.js`
- Modify: `backend/routes/api.js`
- Modify: `backend/routes/announcements.js`
- Modify: `backend/middleware/rateLimiter.js`
- Modify: `backend/__tests__/admin.test.js`

- [ ] **Step 1: Write failing takeover and stale-privilege tests**

Cover register/own-rename/admin-rename attempts to claim `SUPERUSER_NAME`, announcement publication by a same-name non-admin, comment deletion by a same-name non-admin, and friend/message bypass by a same-name non-admin. Replace the old auto-promotion test with:

```js
test('does not derive admin role from the reserved display name', async () => {
  const user = await User.create({ name: SUPERUSER_NAME, password: await bcrypt.hash('legacy-pass', 10), role: 'user' });
  const response = await request(app).post('/api/auth/login').send({ name: user.name, password: 'legacy-pass' });
  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe('user');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test --prefix backend -- --runInBand auth.test.js admin.test.js admin-bootstrap.test.js profile-auth.test.js`  
Expected: the reserved-name and reusable bootstrap cases fail for the current implementation.

- [ ] **Step 3: Implement a shared identity policy**

Expose:

```js
function isFounder(user) { return user?.systemIdentity === 'asen'; }
function isReservedName(name) { return name?.trim() === SUPERUSER_NAME; }
function assertNameClaimAllowed(name, currentUser = null) {
  if (isReservedName(name) && !isFounder(currentUser)) throw new AppError(409, 'Name is reserved');
}
```

Use it in register, profile update, and administrator update. Add the existing `profileUpdate` validator to `PUT /api/users/profile`; require at least eight characters for newly registered or administrator-changed passwords while login remains backward-compatible with existing passwords.

- [ ] **Step 4: Make all authorization role/identity based**

Use `admin` middleware for announcement creation. Remove `isSuperuserName` from moderation. In friend/broadcast policy, query canonical users and use `role === 'admin'` for privilege and `systemIdentity === 'asen'` only for founder-specific presentation/broadcast behavior. Never authorize from a supplied name.

- [ ] **Step 5: Make bootstrap one-time and atomic**

Add a dedicated `adminSetupLimiter`, strict schema `{ secret: string }`, timing-safe secret comparison, and an `AdminBootstrap` document with a unique constant key. Acquire that key before promotion so two concurrent requests cannot both win; a failed promotion releases a pending lock owned by that request. The operation must then:

```js
if (await User.exists({ role: 'admin' })) throw new AppError(409, 'Administrator already configured');
const user = await User.findOneAndUpdate(
  { _id: userId, role: { $ne: 'admin' } },
  { $set: { role: 'admin' }, $inc: { sessionVersion: 1 } },
  { returnDocument: 'after' },
);
```

Return a fresh token, audit success without the secret, and ensure only one of two concurrent calls succeeds.

- [ ] **Step 6: Add the guarded founder migration CLI**

The CLI defaults to dry-run, never upserts, requires exactly one current `SUPERUSER_NAME` match, rejects any existing different `systemIdentity: 'asen'`, and on explicit execution sets that exact `_id` to `role: 'admin'`, `systemIdentity: 'asen'`, and increments `sessionVersion`. Require `--execute --confirm-execute MIGRATE_BLIVER_FOUNDER`; output only matched/modified counts and never user data.

- [ ] **Step 7: Run security and full backend suites**

Run:

```powershell
npm.cmd test --prefix backend -- --runInBand auth.test.js admin.test.js admin-bootstrap.test.js profile-auth.test.js
npm.cmd test --prefix backend -- --runInBand
```

- [ ] **Step 8: Commit**

```powershell
git add backend/models/AdminBootstrap.js backend/services/UserIdentityPolicy.js backend/services/AuthService.js backend/services/AdminService.js backend/services/ProfileService.js backend/services/SuperuserPolicy.js backend/services/FriendsService.js backend/services/FootprintService.js backend/routes/api.js backend/routes/announcements.js backend/middleware/rateLimiter.js backend/validators/schemas.js backend/scripts/migrate-founder-identity.js backend/__tests__
git commit -m "fix: remove display-name authorization"
```

### Task 3: Remove persisted passwords from the browser

**Files:**
- Create: `frontend/src/__tests__/auth.test.js`
- Modify: `frontend/src/auth.js`
- Modify: `frontend/src/components/AuthModal.jsx`
- Modify: `frontend/src/components/__tests__/AuthModal.test.jsx`
- Modify: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Write failing storage tests**

Assert `bliver_cred` is purged on module initialization, submitted passwords never appear in localStorage/sessionStorage, non-persistent sessions use sessionStorage, persistent sessions use localStorage, and logout clears both.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test --prefix frontend -- src/__tests__/auth.test.js src/components/__tests__/AuthModal.test.jsx`  
Expected: current base64 credential persistence fails the assertions.

- [ ] **Step 3: Implement token-only session persistence**

Delete `saveCredentials/getCredentials/clearCredentials`. Add a storage selector:

```js
const stores = () => [sessionStorage, localStorage];
export function saveAuth(user, token, { persistent = false } = {}) {
  clearAuth();
  const storage = persistent ? localStorage : sessionStorage;
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem(TOKEN_KEY, token);
}
```

Read sessionStorage before localStorage, clear both on logout, and remove the legacy `bliver_cred` and `bliver_autologin` keys from both stores at startup. `useAuth` restores whenever a valid token/user pair exists; storage lifetime, rather than a second flag, determines whether the session survives browser restart.

- [ ] **Step 4: Simplify AuthModal**

Replace “remember account/password” and the second auto-login checkbox with one “保持登录” toggle. Pass `{ persistent: rememberSession }` to `saveAuth`; never prefill password.

- [ ] **Step 5: Run focused and full frontend suites**

Run:

```powershell
npm.cmd test --prefix frontend -- src/__tests__/auth.test.js src/components/__tests__/AuthModal.test.jsx
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/auth.js frontend/src/components/AuthModal.jsx frontend/src/hooks/useAuth.ts frontend/src/__tests__/auth.test.js frontend/src/components/__tests__/AuthModal.test.jsx
git commit -m "fix: stop persisting account passwords"
```

### Task 4: Node 24, locked dependencies, and candidate environment

**Files:**
- Modify: `.nvmrc`
- Modify: `package.json`, `package-lock.json`
- Modify: `backend/package.json`, `backend/package-lock.json`
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Delete: `frontend/.env.production`
- Create: `backend/.env.example`
- Create: `frontend/.env.example`
- Create: `render.yaml`
- Modify: `backend/middleware/upload.js`
- Modify: `frontend/src/App.jsx`
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1: Add a failing runtime contract check**

Change `check:node` to require major 24 and add `engines.node: ">=24 <25"` to all package manifests. Before changing `.nvmrc`/CI, run `npm.cmd run check:node` and verify the repository contract is inconsistent.

- [ ] **Step 2: Pin the toolchain and reproducible builds**

Set `.nvmrc` to `24.16.0`, root `packageManager` to `npm@11.13.0`, and use:

```json
"render-build": "npm run check:node && npm --prefix backend ci --omit=dev --no-audit --no-fund && npm --prefix frontend ci --include=dev --no-audit --no-fund && npm --prefix frontend run build"
```

Use `node-version-file: .nvmrc` in CI and add a release job that runs the root build and asserts `frontend/dist/index.html` exists.

- [ ] **Step 3: Remove production endpoint/key coupling**

Delete the tracked production env file containing API/Socket/OWM values. Document same-origin defaults and environment-injected optional values. Never print or commit the previous key.

- [ ] **Step 4: Add candidate-only Render Blueprint**

Declare `bliver-candidate` with root build/start, `/readyz`, auto deploy off, Node 24, `NODE_ENV=production`, `DEPLOY_ENV=candidate`, and `sync: false` for secrets. Do not declare or replace the existing production service.

- [ ] **Step 5: Isolate uploads and telemetry**

Read `CLOUDINARY_FOLDER` with a production-compatible default, return generic upload errors, and set Sentry release/environment from `RENDER_GIT_COMMIT`/`DEPLOY_ENV` and `VITE_DEPLOY_ENV`.

- [ ] **Step 6: Refresh locks and remediate high advisories**

Run package updates within declared semver ranges, then:

```powershell
npm.cmd install --package-lock-only
npm.cmd install --package-lock-only --prefix backend
npm.cmd install --package-lock-only --prefix frontend
npm.cmd audit --omit=dev --audit-level=high
npm.cmd audit --omit=dev --audit-level=high --prefix backend
npm.cmd audit --omit=dev --audit-level=high --prefix frontend
```

Expected: no unhandled critical/high advisory. Any transitive build-only exception must be recorded in final QA with advisory ID and fix status.

- [ ] **Step 7: Verify clean installs and commit**

Run `npm.cmd ci` for each package, `npm.cmd run check:node`, backend/frontend tests, typecheck, and build. Commit as `build: standardize Node 24 release runtime`.

### Task 5: Release-aware liveness, readiness, and shutdown

**Files:**
- Create: `backend/services/runtimeStatus.js`
- Create: `backend/__tests__/runtime-health.test.js`
- Modify: `backend/index.js`
- Modify: `backend/__tests__/observability.test.js`

- [ ] **Step 1: Write failing endpoint tests**

Test JSON/no-store responses, release metadata, Node version, connected/disconnected Mongo readiness, missing `frontend/dist/index.html`, and production-safe 500 messages.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test --prefix backend -- --runInBand runtime-health.test.js observability.test.js`  
Expected: `/readyz` and `/versionz` are 404 and `/healthz` lacks release/node.

- [ ] **Step 3: Implement runtime status**

Expose:

```js
const release = process.env.RENDER_GIT_COMMIT || process.env.RELEASE_SHA || 'local';
function readiness() {
  const database = mongoose.connection.readyState === 1;
  const frontend = fs.existsSync(frontendIndex);
  return { ready: database && frontend, database, frontend };
}
```

`/healthz`, `/readyz`, and `/versionz` must set `Cache-Control: no-store`, return JSON, and never expose paths, URIs, or secrets.

- [ ] **Step 4: Add graceful shutdown**

On `SIGTERM`/`SIGINT`, stop accepting HTTP, close Socket.IO, disconnect Mongoose, and exit once. Export the shutdown factory for a focused unit test; keep `require.main === module` behavior.

- [ ] **Step 5: Run focused/full tests and commit**

Run the focused tests, full backend suite, and local HTTP smoke. Commit as `feat: add release readiness endpoints`.

### Task 6: Make frontend lint a truthful gate

**Files:**
- Modify: `frontend/eslint.config.js`
- Modify: files reported by `npm.cmd run lint --prefix frontend`
- Test: existing colocated frontend tests

- [ ] **Step 1: Capture the baseline by rule and file**

Run ESLint JSON output and record 89 errors/16 warnings as the pre-fix baseline. Add scoped globals for service worker and Vitest files. Do not disable `rules-of-hooks`, `immutability`, or `refs` repository-wide.

- [ ] **Step 2: Fix correctness errors first**

Repair conditional hook calls in `useFootprintActions`, hook naming in `useConversations`, render-time ref mutation in `PanToTarget`, and declaration-order/stale dependency issues in `App`. Add or update focused tests before each behavior change.

- [ ] **Step 3: Remove dead imports/variables and scope framework rules**

Remove unused values. Configure `react-hooks/set-state-in-effect` as a warning for legacy fetch/synchronization effects, while leaving hook ordering and ref safety as errors. Scope `react-refresh/only-export-components` only where non-component context exports are intentional.

- [ ] **Step 4: Run lint, tests, typecheck, and build**

Expected: ESLint has zero errors; frontend tests, typecheck, and build pass. Commit as `chore: enforce frontend release lint`.

### Task 7: Release verification, smoke, and guarded backfill evidence

**Files:**
- Create: `scripts/verify-release.mjs`
- Create: `scripts/release-smoke.mjs`
- Create: `backend/scripts/backfill-report.js`
- Create: `backend/__tests__/release-backfill-cli.test.js`
- Modify: `backend/scripts/backfill-footprint-geography.js`
- Modify: `package.json`, `backend/package.json`

- [ ] **Step 1: Write failing CLI guard tests**

Prove every `--execute` requires the exact confirmation token, not only when `NODE_ENV=production`; prove dry-run remains the default and never writes.

- [ ] **Step 2: Harden execute confirmation**

Accept `--confirm-execute BACKFILL_FOOTPRINT_GEOGRAPHY`; reject missing/invalid confirmation in every environment. Preserve the old production flag only as a temporary alias if existing operators need it.

- [ ] **Step 3: Implement read-only report output**

Report counts by backfill status/visibility, stale leases, failed/dead, eligible records, and unique two-decimal coordinates. Output JSON only and never include location coordinates, user content, URI, secret, runToken, or raw error strings.

- [ ] **Step 4: Implement release smoke**

Use built-in `fetch` with timeouts. Validate `/`, `/healthz`, `/readyz`, `/versionz`, guest Activity/map, unauthenticated 401, Socket.IO polling 200, JSON content types, `X-Request-Id`, and optional exact `EXPECTED_RELEASE`. Never print tokens or response bodies.

- [ ] **Step 5: Implement the aggregate verifier**

Run Node check, backend Jest, the discovery-window test three times, frontend Vitest/lint/typecheck/build, audits, `git diff --check`, clean status, and artifact hash. Stop at first failure with a nonzero exit.

- [ ] **Step 6: Run tests and commit**

Add root scripts `verify:release` and `smoke:release`; run both against a local server. Commit as `build: add release verification gates`.

### Task 8: Runbook and consolidated QA contract

**Files:**
- Create: `docs/release/eight-phase-release-runbook.md`
- Create: `docs/qa/eight-phase-release-checklist.md`
- Create: `docs/qa/profile-memories-checklist.md`
- Create: `docs/qa/legacy-hardening-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Write the immutable-SHA runbook**

Document G0-G10: freeze, build, candidate infrastructure, smoke, four-view browser, data rehearsal, production backup, canary, backfill, final browser smoke, and 30-60 minute observation. Include exact commands, required evidence, stop conditions, and whole-service rollback.

- [ ] **Step 2: Write data safety procedures**

Require independent candidate Mongo, production snapshot/restore proof, index listing and representative `explain`, one runner, production `delay >= 1000ms`, dry-run, first `limit 5-10`, later `50-100`, saved cursor/window token, and no reverse migration.

- [ ] **Step 3: Consolidate UI/Socket acceptance**

Include current SHA checks at 360x800, 390x844, 430x932, and 1440x1000 for guest/admin/two users; keyboard, focus, safe area, reduced motion, offline/errors; real two-user Socket; Cloudinary/Nominatim/tiles/push degradation; and privacy payload exclusions.

- [ ] **Step 4: Self-review and commit**

Scan for placeholders, contradictory rollback statements, secret values, and unowned exceptions. Commit as `docs: add eight-phase release runbook`.

### Task 9: Final code review and immutable candidate SHA

**Files:** all changed files from Tasks 1-8.

- [ ] **Step 1: Run `npm.cmd run verify:release` on a clean Node 24 checkout**
- [ ] **Step 2: Request spec-compliance and code-quality review; fix all Critical/Important findings**
- [ ] **Step 3: Rerun the complete verifier and record the final SHA and artifact hashes**
- [ ] **Step 4: Push `codex/map-home-redesign` and wait for GitHub Actions success**
- [ ] **Step 5: Freeze the SHA; any subsequent code change creates a new candidate and restarts G1**

### Task 10: Provision and accept the Render candidate

**Files:** no repository edits except evidence checkboxes after completion.

- [ ] **Step 1: Create `bliver-candidate` from `render.yaml` with auto deploy off**
- [ ] **Step 2: Configure independent Mongo database, JWT/admin/VAPID secrets, candidate Cloudinary folder, and no production API override**
- [ ] **Step 3: Deploy the frozen commit ID and assert health/readiness/version all return that SHA**
- [ ] **Step 4: Bootstrap disposable admin/user A/user B and deterministic visibility/message/block/report fixtures**
- [ ] **Step 5: Run HTTP/Socket smoke and the four-viewport browser matrix**
- [ ] **Step 6: Run backfill report, dry-run, execute `limit 5`, cursor resume, idempotency, failure/retry, and payload privacy checks**
- [ ] **Step 7: Complete candidate QA evidence; stop on any P0/P1**

### Task 11: Promote the same SHA and complete production rollout

**Files:** `docs/qa/eight-phase-release-checklist.md` evidence only.

- [ ] **Step 1: Record previous production SHA/deploy ID/config and prove a restorable Mongo snapshot**
- [ ] **Step 2: Read-only verify the unique founder account/admin state and backfill/index baseline without printing PII; after the snapshot, run the guarded founder migration only if the controlled founder lacks its immutable identity/role**
- [ ] **Step 3: Fast-forward `main` to the frozen SHA; if a merge commit changes SHA, redeploy/reaccept candidate first**
- [ ] **Step 4: Align production Node/build/start/health/env contract and deploy the exact accepted SHA**
- [ ] **Step 5: Verify production JSON health/readiness/version, guest APIs, Socket polling, logs, and request IDs**
- [ ] **Step 6: Use disposable accounts for public/friends/private and precise/approximate check-ins, comment/reaction/report/message/block/admin canary**
- [ ] **Step 7: Run production report and dry-run, then single-runner `limit 5-10 --delay 1000` execute with explicit confirmation**
- [ ] **Step 8: Continue `limit 50-100` batches only after each saved report/cursor passes stop conditions; review failed/dead before retry**
- [ ] **Step 9: Rerun browser/Socket smoke and observe 30-60 minutes for errors, latency, DB, and external provider health**
- [ ] **Step 10: Sign the final checklist only when all completion criteria are evidenced; otherwise roll back the compatible whole-service SHA and preserve backfill state**

## Plan Self-Review

- Every P0 from the release audit maps to Tasks 1-3.
- Node 24, same-origin candidate safety, locked builds, health/readiness, lint/audit, and immutable SHA map to Tasks 4-7 and 9.
- Phase 7/8, authenticated browser, Socket, environment degradation, and backfill evidence map to Tasks 8, 10, and 11.
- Candidate and production never share a database; production writes occur only after candidate acceptance and a restorable snapshot.
- The current combined Express service is always deployed and rolled back as one SHA.
