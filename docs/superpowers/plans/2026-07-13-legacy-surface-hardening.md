# Legacy Surface Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the legacy admin, photo wall, and announcement surfaces to Natural City while adding lazy loading, accessibility/performance hardening, and request/telemetry observability.

**Architecture:** Keep existing state ownership and legacy bridge behavior. Add a small frontend telemetry module, backend request-context aggregate, and a shared lazy-surface fallback. Scope legacy visual changes under semantic BEM wrappers and existing design tokens.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, Express 5, Jest, Supertest, Sentry, CSS custom properties.

---

### Task 1: Frontend telemetry contract

**Files:**
- Create: `frontend/src/observability.js`
- Test: `frontend/src/__tests__/observability.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from 'vitest';
import { recordMetric } from '../observability';

describe('recordMetric', () => {
  it('dispatches a PII-free telemetry event and Sentry breadcrumb', () => {
    const addBreadcrumb = vi.fn();
    window.__bliverSentry = { addBreadcrumb };
    const listener = vi.fn();
    window.addEventListener('bliver:telemetry', listener);

    recordMetric('legacy_surface_load', { surface: 'photo', status: 'ok', durationMs: 12, content: 'secret' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({
      name: 'legacy_surface_load', surface: 'photo', status: 'ok', durationMs: 12,
    });
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ category: 'bliver.telemetry' }));
    delete window.__bliverSentry;
    window.removeEventListener('bliver:telemetry', listener);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/__tests__/observability.test.js`
Expected: FAIL because `frontend/src/observability.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Export `recordMetric(name, detail = {})`. Keep only `surface`, `status`, `durationMs`, `count`, and `reason`; dispatch `new CustomEvent('bliver:telemetry', { detail: payload })`; call `window.__bliverSentry?.addBreadcrumb` when present. Never include arbitrary detail keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/__tests__/observability.test.js`
Expected: PASS.

### Task 2: Backend request context and health endpoint

**Files:**
- Create: `backend/middleware/requestContext.js`
- Modify: `backend/index.js`
- Test: `backend/__tests__/observability.test.js`

- [ ] **Step 1: Write the failing tests**

Cover `GET /healthz` returning status/uptime/requests, an API response containing `X-Request-Id`, and a caller-supplied request id being echoed without authorization/body data in the aggregate.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend test -- --runInBand backend/__tests__/observability.test.js`
Expected: FAIL because `/healthz` and request context middleware are missing.

- [ ] **Step 3: Write minimal implementation**

Implement a module-level bounded `Map` keyed by `METHOD path status`, `requestContext` middleware using `crypto.randomUUID()`, `res.setHeader('X-Request-Id', id)`, and `res.on('finish')` to increment count and duration. Register middleware before routes and add `GET /healthz` before the SPA fallback. Return only aggregate counters and process uptime.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend test -- --runInBand backend/__tests__/observability.test.js`
Expected: PASS.

### Task 3: Lazy legacy surface boundary

**Files:**
- Create: `frontend/src/components/shell/LegacySurfaceFallback.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/components/shell/__tests__/LegacySurfaceFallback.test.jsx`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx` only where async lazy assertions require `findBy*`.

- [ ] **Step 1: Write the failing test**

Assert fallback has `role="status"`, a readable loading label, safe-area padding class, and no hard-coded dark/aurora classes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/shell/__tests__/LegacySurfaceFallback.test.jsx`
Expected: FAIL because the component is missing.

- [ ] **Step 3: Write minimal implementation**

Create the fallback and replace synchronous imports for `AdminPanel`, `PhotoWall`, and `AnnouncementPanel` with `lazy(() => import(...))`. Wrap each conditional surface in one `Suspense` boundary with the fallback. Record `legacy_surface_open` before mounting and `legacy_surface_load_error` in the existing `ErrorBoundary` path.

- [ ] **Step 4: Run focused tests**

Run: `npm --prefix frontend test -- src/components/shell/__tests__/LegacySurfaceFallback.test.jsx src/__tests__/App.mobile-shell.test.jsx`
Expected: PASS.

### Task 4: Admin surface Natural City adaptation and accessibility

**Files:**
- Modify: `frontend/src/components/AdminPanel.jsx`
- Modify: `frontend/src/components/AdminUsersTab.jsx`
- Modify: `frontend/src/components/AdminOnlineTab.jsx`
- Modify: `frontend/src/components/AdminClonesTab.jsx`
- Modify: `frontend/src/components/AdminAuditTab.jsx`
- Modify: `frontend/src/components/AdminFeedbackTab.jsx`
- Modify: `frontend/src/components/admin/AdminReportsTab.jsx`
- Modify: `frontend/src/styles/tokens.css`
- Test: `frontend/src/__tests__/AdminPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

Assert the panel has `role="dialog"`, `aria-labelledby`, a labelled 44px close button, a `bliver-legacy-surface` wrapper, and an image failure does not remove the user row. Assert tab buttons expose `aria-selected`.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm --prefix frontend test -- src/__tests__/AdminPanel.test.jsx`
Expected: FAIL on the new semantic and theme assertions.

- [ ] **Step 3: Implement minimal UI changes**

Replace black-glass outer classes with semantic wrapper classes, add focus-visible styles and Natural City colors in `tokens.css`, add `role="dialog"`/`aria-modal`/heading id, add labels and `aria-selected` to tabs, add `alt`/`loading`/`decoding` to avatars, and use inline alert text for refresh failures. Preserve all existing handlers and tab data flow.

- [ ] **Step 4: Run focused tests**

Run: `npm --prefix frontend test -- src/__tests__/AdminPanel.test.jsx src/components/admin/__tests__/AdminReportsTab.test.jsx`
Expected: PASS.

### Task 5: Photo wall and announcement hardening

**Files:**
- Modify: `frontend/src/components/PhotoWall.jsx`
- Modify: `frontend/src/components/AnnouncementPanel.jsx`
- Modify: `frontend/src/styles/tokens.css`
- Tests: `frontend/src/components/__tests__/PhotoWall.test.jsx`, `frontend/src/__tests__/useAnnounceUnread.test.js`

- [ ] **Step 1: Write failing tests**

Cover photo wall dialog labelling, meaningful image alt text, load-error placeholder, memoized card export behavior, and announcement fetch failure with a retry action. Assert announcement controls are labelled and the panel uses the legacy surface class.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix frontend test -- src/components/__tests__/PhotoWall.test.jsx src/__tests__/useAnnounceUnread.test.js`
Expected: FAIL on the new accessibility/error assertions.

- [ ] **Step 3: Implement minimal changes**

Use a semantic dialog heading, 44px close button, `React.memo` for `PhotoCard`, `decoding="async"`, `onError` placeholder state, `content-visibility: auto` for grid items, and reduced-motion-safe transitions. Replace resize state with `matchMedia('(max-width: 767px)')` listener, add retry/error state, and use Natural City token classes instead of aurora gradients.

- [ ] **Step 4: Run focused tests**

Run: `npm --prefix frontend test -- src/components/__tests__/PhotoWall.test.jsx src/__tests__/useAnnounceUnread.test.js`
Expected: PASS.

### Task 6: Surface metrics and regression cleanup

**Files:**
- Modify: `frontend/src/components/AdminPanel.jsx`
- Modify: `frontend/src/components/PhotoWall.jsx`
- Modify: `frontend/src/components/AnnouncementPanel.jsx`
- Modify: `frontend/src/components/ErrorBoundary.jsx`
- Modify: `frontend/src/App.jsx`
- Tests: existing surface tests plus `frontend/src/__tests__/observability.test.js`

- [ ] **Step 1: Write failing metric assertions**

Assert open/load/error metrics for each surface and an error-boundary metric with only `surface` and `reason` fields.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix frontend test -- src/__tests__/observability.test.js src/__tests__/AdminPanel.test.jsx src/components/__tests__/PhotoWall.test.jsx`
Expected: FAIL because surfaces do not call `recordMetric`.

- [ ] **Step 3: Implement instrumentation and cleanup**

Record start timestamps with `performance.now()`, emit success/failure metrics around fetches and actions, report lazy errors from `ErrorBoundary.componentDidCatch`, and guard async state updates with mounted refs. Remove unused imports and duplicate transition declarations.

- [ ] **Step 4: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: all existing and new tests pass with no unhandled rejection warnings.

### Task 7: Full verification

**Files:** none beyond prior tasks.

- [ ] **Step 1: Run typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: exit 0.

- [ ] **Step 2: Run frontend build**

Run: `npm --prefix frontend run build`
Expected: exit 0 and separate lazy chunks for the three legacy surfaces.

- [ ] **Step 3: Run backend regression suite**

Run: `npm --prefix backend test -- --runInBand`
Expected: all backend tests pass.

- [ ] **Step 4: Check diff and working tree**

Run: `git diff --check; git status --short --branch`
Expected: no whitespace errors; remain on `codex/map-home-redesign`; no push/deploy/backfill commands executed.
