# Unified Profile Experience and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make owner and visitor profiles share one responsive experience, remove repeated five-second profile blocking, and close transient overlays whenever bottom navigation changes destination.

**Architecture:** Keep the existing authorization service, but add a `view=core` profile read that skips unused activity aggregations. Move profile reads into TanStack Query with viewer-aware keys, render a shared `ProfileExperience` inside full-screen mobile and drawer desktop containers, and centralize transient UI cleanup in Zustand.

**Tech Stack:** React 19, TanStack Query 5, Zustand 5, Vitest/Testing Library, Express 5, Mongoose 9, Jest/Supertest.

---

## File Map

- `backend/routes/profile.js`: parse the explicit core-view request.
- `backend/services/ProfileService.js`: conditionally skip recent reaction/comment aggregation.
- `backend/__tests__/footprint-http-visibility.test.js`: prove core responses stay authorized and omit activity aggregates.
- `frontend/src/api.js`: send the profile view parameter.
- `frontend/src/hooks/useProfileData.js`: own viewer-aware Query caching, placeholder identity, mutations, and realtime cache updates.
- `frontend/src/hooks/__tests__/useProfileData.test.jsx`: verify caching, viewer isolation, placeholder rendering, and refresh fallback.
- `frontend/src/components/ProfileExperience.jsx`: shared owner/visitor profile content.
- `frontend/src/components/MeExperience.jsx`: thin compatibility wrapper for the owner destination.
- `frontend/src/components/ProfileDrawer.jsx`: responsive container around shared content.
- `frontend/src/components/__tests__/ProfileExperience.test.jsx`: verify owner/visitor actions and profile tabs.
- `frontend/src/store/useUIStore.ts`: expose one transient-surface reset action.
- `frontend/src/store/__tests__/useUIStore.test.ts`: verify the reset is complete and does not erase toasts or realtime state.
- `frontend/src/App.jsx`: route both profile entry points through shared content and reset overlays on every destination press.
- `frontend/src/__tests__/App.mobile-shell.test.jsx`: verify same- and cross-destination navigation closes overlays.

### Task 1: Add the fast core profile response

**Files:**
- Modify: `backend/routes/profile.js`
- Modify: `backend/services/ProfileService.js`
- Modify: `backend/__tests__/footprint-http-visibility.test.js`

- [ ] **Step 1: Write the failing HTTP test**

Add a test that requests `/api/users/:id/profile?view=core`, asserts the existing authorized `user` and `footprints`, and asserts both aggregate fields are absent:

```js
const response = await request(app)
  .get(`/api/users/${target.id}/profile?view=core`)
  .set(auth(viewer));

expect(response.status).toBe(200);
expect(response.body.user._id).toBe(target.id);
expect(response.body.footprints.map((item) => item._id)).toEqual([visible.id]);
expect(response.body).not.toHaveProperty('recentReactions');
expect(response.body).not.toHaveProperty('recentComments');
```

- [ ] **Step 2: Run the focused backend test and confirm failure**

Run: `npm --prefix backend test -- --runInBand backend/__tests__/footprint-http-visibility.test.js`

Expected: FAIL because the current service always returns `recentReactions` and `recentComments`.

- [ ] **Step 3: Pass an explicit option from the route**

Change the route call to:

```js
const result = await profileService.getProfile(req.params.id, viewer, {
  includeActivity: req.query.view !== 'core',
});
```

Change `getProfile` to accept `{ includeActivity = true } = {}`. Only call `collectRecentReactions` and `collectRecentComments` when `includeActivity` is true, and conditionally spread those fields into the result:

```js
const activity = includeActivity
  ? {
      recentReactions: (await collectRecentReactions({ user, access, isAdmin, now }))
        .map((fp) => sanitizeLocation(fp.toObject(), isAdmin)),
      recentComments: (await collectRecentComments({ user, access, isAdmin, now }))
        .map((fp) => sanitizeLocation(fp.toObject(), isAdmin)),
    }
  : {};

return { user: publicProfileUser(user, { includeVisitors }), footprints, ...activity };
```

- [ ] **Step 4: Run profile visibility tests**

Run: `npm --prefix backend test -- --runInBand backend/__tests__/footprint-http-visibility.test.js`

Expected: PASS, including existing full-response tests and the new core-response test.

- [ ] **Step 5: Commit the backend slice**

```bash
git add backend/routes/profile.js backend/services/ProfileService.js backend/__tests__/footprint-http-visibility.test.js
git commit -m "perf: add core profile response"
```

### Task 2: Cache profile reads by target and viewer

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/hooks/useProfileData.js`
- Create: `frontend/src/hooks/__tests__/useProfileData.test.jsx`

- [ ] **Step 1: Write failing hook tests**

Render the hook twice inside the same `QueryClientProvider` and assert only one request is made. Seed `getUser()` for the owner and assert the returned profile is immediately available while the request is pending. Rerender with another viewer and assert a separate query is created:

```jsx
const first = renderHook(() => useProfileData('owner-1'), { wrapper });
await waitFor(() => expect(first.result.current.profile?.name).toBe('阿森'));
first.unmount();
renderHook(() => useProfileData('owner-1'), { wrapper });
expect(apiClient.users.profile).toHaveBeenCalledTimes(1);
expect(queryClient.getQueryCache().getAll()[0].queryKey)
  .toEqual(['profile', 'owner-1', 'owner-1']);
```

- [ ] **Step 2: Run the hook test and confirm failure**

Run: `npm --prefix frontend test -- src/hooks/__tests__/useProfileData.test.jsx`

Expected: FAIL because `useProfileData` currently owns uncached local request state.

- [ ] **Step 3: Add the core API option and Query read**

Update the client method:

```js
profile(id, { view = 'core', ...opts } = {}) {
  return api.get(qs(`/api/users/${id}/profile`, { view }), opts);
}
```

In `useProfileData`, use `useQueryClient` and `useQuery` with:

```js
const viewerId = currentUser?._id || 'guest';
const queryKey = ['profile', userId, viewerId];
const profileQuery = useQuery({
  queryKey,
  queryFn: ({ signal }) => apiClient.users.profile(userId, { signal }).then(({ data }) => data),
  enabled: Boolean(userId),
  placeholderData: isOwnProfile && currentUser
    ? { user: currentUser, footprints: [] }
    : undefined,
});
```

Expose `profileQuery.isLoading`, `profileQuery.isFetching`, `profileQuery.error`, `profileQuery.refetch`, and derived values from `profileQuery.data`. Convert realtime subscriptions and successful profile mutations to `queryClient.setQueryData(queryKey, updater)` so remounts keep the latest values.

- [ ] **Step 4: Run hook and existing profile tests**

Run: `npm --prefix frontend test -- src/hooks/__tests__/useProfileData.test.jsx src/components/__tests__/MeExperience.test.jsx src/components/__tests__/DestinationSurfaceReservation.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit the caching slice**

```bash
git add frontend/src/api.js frontend/src/hooks/useProfileData.js frontend/src/hooks/__tests__/useProfileData.test.jsx
git commit -m "perf: cache profile experience data"
```

### Task 3: Build one owner and visitor profile experience

**Files:**
- Create: `frontend/src/components/ProfileExperience.jsx`
- Modify: `frontend/src/components/MeExperience.jsx`
- Modify: `frontend/src/components/ProfileDrawer.jsx`
- Create: `frontend/src/components/__tests__/ProfileExperience.test.jsx`
- Modify: `frontend/src/components/__tests__/MeExperience.test.jsx`
- Modify: `frontend/src/components/__tests__/DestinationSurfaceReservation.test.jsx`

- [ ] **Step 1: Write failing shared-content tests**

Mock `useProfileData` and verify owner controls and visitor controls are mutually exclusive:

```jsx
render(<ProfileExperience userId="owner-1" onOpenSettings={onSettings} onLogout={onLogout} />);
expect(screen.getByRole('button', { name: '打开隐私设置' })).toBeVisible();
expect(screen.getByRole('button', { name: '退出登录' })).toBeVisible();
expect(screen.queryByRole('button', { name: '发送私信' })).not.toBeInTheDocument();

render(<ProfileExperience userId="visitor-2" friendshipStatus={() => 'accepted'} onOpenChat={onChat} />);
expect(screen.getByRole('button', { name: '发送私信' })).toBeVisible();
expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
```

Also cover pending incoming/outgoing requests, send request, empty/error/retry states, timeline/photo tabs, and footprint selection.

- [ ] **Step 2: Run the shared-content tests and confirm failure**

Run: `npm --prefix frontend test -- src/components/__tests__/ProfileExperience.test.jsx`

Expected: FAIL because `ProfileExperience` does not exist.

- [ ] **Step 3: Implement `ProfileExperience`**

Move the Natural City layout and tabs from `MeExperience` into the shared component. Add a compact identity action section:

```jsx
const relationship = friendshipStatus?.(userId) || 'none';
const canChat = relationship === 'accepted' || isSuperuser(profile);

{isOwnProfile ? (
  <OwnerActions onOpenSettings={onOpenSettings} onLogout={onLogout} />
) : (
  <RelationshipActions
    relationship={relationship}
    pendingRequestId={pendingRequestId}
    onChat={() => onOpenChat?.(userId)}
    onSend={() => onSendFriendRequest?.(userId)}
    onAccept={() => onAcceptRequest?.(pendingRequestId)}
    onReject={() => onRejectRequest?.(pendingRequestId)}
    canChat={canChat}
  />
)}
```

Keep all interactive targets at least 44px, use Lucide icons, keep stable skeleton dimensions, use semantic tabs, and show cached-data refresh errors without replacing visible content.

- [ ] **Step 4: Convert existing entry components to containers**

Make `MeExperience` a thin wrapper that passes owner callbacks to `ProfileExperience`. Replace the body of `ProfileDrawer` with the existing backdrop/drawer motion container and a `ProfileExperience` child receiving all visitor callbacks. Preserve `reserveMobileNavigation`, Escape/backdrop close, and desktop drawer width.

- [ ] **Step 5: Run all profile component tests**

Run: `npm --prefix frontend test -- src/components/__tests__/ProfileExperience.test.jsx src/components/__tests__/MeExperience.test.jsx src/components/__tests__/DestinationSurfaceReservation.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit the unified experience**

```bash
git add frontend/src/components/ProfileExperience.jsx frontend/src/components/MeExperience.jsx frontend/src/components/ProfileDrawer.jsx frontend/src/components/__tests__/ProfileExperience.test.jsx frontend/src/components/__tests__/MeExperience.test.jsx frontend/src/components/__tests__/DestinationSurfaceReservation.test.jsx
git commit -m "feat: unify owner and visitor profiles"
```

### Task 4: Close transient surfaces on every destination press

**Files:**
- Modify: `frontend/src/store/useUIStore.ts`
- Create: `frontend/src/store/__tests__/useUIStore.test.ts`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/__tests__/App.mobile-shell.test.jsx`

- [ ] **Step 1: Write the failing store test**

Open representative surfaces and map selections, invoke `closeTransientSurfaces`, and assert the reset:

```ts
useUIStore.setState({
  showPhotoWall: true,
  showTimeline: true,
  showNotifs: true,
  showFriends: true,
  viewingProfileId: 'user-2',
  mapPreviewId: 'fp-1',
  activeFootprintId: 'fp-2',
  samePlaceIds: ['fp-3'],
});
useUIStore.getState().closeTransientSurfaces();
expect(useUIStore.getState()).toMatchObject({
  showPhotoWall: false,
  showTimeline: false,
  showNotifs: false,
  showFriends: false,
  viewingProfileId: null,
  mapPreviewId: null,
  activeFootprintId: null,
  samePlaceIds: [],
});
```

- [ ] **Step 2: Run store/App tests and confirm failure**

Run: `npm --prefix frontend test -- src/store/__tests__/useUIStore.test.ts src/__tests__/App.mobile-shell.test.jsx`

Expected: FAIL because the reset action does not exist and same-destination clicks return before cleanup.

- [ ] **Step 3: Implement the centralized reset**

Add `closeTransientSurfaces` to the store interface and implementation. Reset modal/drawer flags, chat/profile ids, and map detail/preview ids while preserving authentication identity, realtime event counters, toasts, and the selected destination:

```ts
closeTransientSurfaces: () => set({
  showCheckIn: false,
  showTimeline: false,
  showNotifs: false,
  showAdmin: false,
  showAuth: false,
  showPhotoWall: false,
  showAbout: false,
  showFeedback: false,
  showAnnouncements: false,
  showFriends: false,
  chatUserId: null,
  viewingProfileId: null,
  activeFootprintId: null,
  mapPreviewId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  clusterData: null,
  samePlaceIds: [],
  shareTarget: null,
}),
```

- [ ] **Step 4: Route bottom navigation through the reset**

Destructure `closeTransientSurfaces` in `App`. Replace the early-return handler with:

```js
const handleDestinationChange = (nextDestination) => {
  if (activeDestination === 'activity') setActivityDetailFp(null);
  closeTransientSurfaces();
  if (nextDestination !== activeDestination) setActiveDestination(nextDestination);
};
```

When opening a photo wall or timeline from personal space, close the current profile before opening the next surface. Preserve the existing map-target behavior after selecting a footprint.

- [ ] **Step 5: Run store and App navigation tests**

Run: `npm --prefix frontend test -- src/store/__tests__/useUIStore.test.ts src/__tests__/App.mobile-shell.test.jsx`

Expected: PASS, including same-destination cleanup.

- [ ] **Step 6: Commit navigation cleanup**

```bash
git add frontend/src/store/useUIStore.ts frontend/src/store/__tests__/useUIStore.test.ts frontend/src/App.jsx frontend/src/__tests__/App.mobile-shell.test.jsx
git commit -m "fix: close overlays on destination changes"
```

### Task 5: Full verification and deployment

**Files:**
- Modify if required by failures: only files already listed above

- [ ] **Step 1: Run complete local verification**

Run:

```powershell
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix backend test -- --runInBand
npm run check:node
npm run render-build
Test-Path frontend/dist/index.html
git diff --check
```

Expected: all test suites, typecheck, lint, Node check, and production build pass; `Test-Path` prints `True`; `git diff --check` is silent.

- [ ] **Step 2: Inspect the production build locally**

Start the combined server with safe local environment values, open the app at desktop and mobile widths, and verify owner profile, visitor profile, repeated open, photo wall cleanup, and map/activity/me switching. Do not use production data for write operations.

- [ ] **Step 3: Commit any verification-only corrections**

```bash
git add backend/routes/profile.js backend/services/ProfileService.js backend/__tests__/footprint-http-visibility.test.js frontend/src/api.js frontend/src/hooks/useProfileData.js frontend/src/hooks/__tests__/useProfileData.test.jsx frontend/src/components/ProfileExperience.jsx frontend/src/components/MeExperience.jsx frontend/src/components/ProfileDrawer.jsx frontend/src/components/__tests__/ProfileExperience.test.jsx frontend/src/components/__tests__/MeExperience.test.jsx frontend/src/components/__tests__/DestinationSurfaceReservation.test.jsx frontend/src/store/useUIStore.ts frontend/src/store/__tests__/useUIStore.test.ts frontend/src/App.jsx frontend/src/__tests__/App.mobile-shell.test.jsx
git commit -m "test: complete profile navigation acceptance"
```

Skip this commit when verification required no corrections.

- [ ] **Step 4: Push the verified branch**

Run: `git push origin codex/map-home-redesign`

Expected: the remote branch advances to the locally verified SHA.

- [ ] **Step 5: Promote the exact verified SHA through the repository's Render process**

Use the authenticated Render dashboard/API available in the environment. Deploy the exact verified commit, keep the combined frontend/backend service configuration, and do not run any geography backfill. Record the deploy id and SHA.

- [ ] **Step 6: Verify production health**

Run the release smoke tooling against `https://bliver.onrender.com`, then check `/healthz`, `/readyz`, and `/versionz`. Expected: readiness is `200`, database and frontend are ready, and `/versionz` reports the deployed SHA. Open the live UI and verify the same profile and navigation flows without submitting real content.
