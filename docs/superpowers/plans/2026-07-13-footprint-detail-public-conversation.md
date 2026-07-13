# Bliver Footprint Detail and Public Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy footprint modal with a Natural City bottom detail sheet and add authorized two-level public comments, reactions, reporting, and administrator moderation.

**Architecture:** Extend the embedded footprint comment schema without migrating legacy comments, and keep all read/mutation authorization behind the existing footprint visibility policy. Add a focused report model/service, keep React Query as the shared Map/Activity/detail state source, and preserve the current `FootprintDetailModal` entry contract while replacing its internals with focused sheet, conversation, and moderation components.

**Tech Stack:** Express 5, Mongoose 9, Zod 4, Jest/Supertest, React 19, React Query 5, Framer Motion 12, Tailwind CSS 4, Vitest, Testing Library, Lucide React.

---

## Scope and File Map

**Create**

- `backend/models/Report.js` - report persistence and pending-report uniqueness.
- `backend/services/ReportService.js` - report submission, listing, and explicit moderation resolution.
- `backend/routes/reports.js` - authenticated report submission routes.
- `backend/__tests__/footprint-conversation-service.test.js` - comment depth, ordering, deletion, and authorization tests.
- `backend/__tests__/report-service.test.js` - report domain tests.
- `backend/__tests__/report-http.test.js` - report and admin moderation HTTP contract tests.
- `frontend/src/domain/footprintConversation.js` - deterministic comment-tree and permission helpers.
- `frontend/src/components/footprint/FootprintDetailSheet.jsx` - sheet geometry and lifecycle.
- `frontend/src/components/footprint/FootprintConversation.jsx` - chronological comments, replies, composer, and errors.
- `frontend/src/components/footprint/ModerationMenu.jsx` - permission-derived More menu and report form.
- `frontend/src/components/admin/AdminReportsTab.jsx` - pending-report queue and resolution controls.
- `frontend/src/domain/__tests__/footprintConversation.test.js`
- `frontend/src/components/footprint/__tests__/FootprintDetailSheet.test.jsx`
- `frontend/src/components/footprint/__tests__/FootprintConversation.test.jsx`
- `frontend/src/components/footprint/__tests__/ModerationMenu.test.jsx`
- `frontend/src/components/admin/__tests__/AdminReportsTab.test.jsx`
- `docs/qa/footprint-detail-conversation-checklist.md`

**Modify**

- `backend/models/Footprint.js` - optional reply/deletion metadata on embedded comments.
- `backend/services/FootprintService.js` - reply validation, deterministic ordering, placeholder deletion, and role-based moderation.
- `backend/validators/schemas.js` - comment/reply/report schemas.
- `backend/routes/api.js` - extended comment request and report router mount.
- `backend/routes/admin.js` - report queue and resolution routes.
- `backend/models/AuditLog.js` and `backend/services/AuditService.js` - report moderation audit types.
- `backend/index.js` - mount the report router only if it is not mounted through `api.js`.
- `frontend/src/api.js` - reply, report, and admin report clients.
- `frontend/src/hooks/socketHandlers.js` - exported shared cache replacement helper.
- `frontend/src/hooks/useFootprintActions.js` - React Query mutation updates and reply/report actions.
- `frontend/src/contexts/FootprintActionsContext.jsx` - expose the expanded action contract.
- `frontend/src/hooks/useAuth.ts` - pending reply/report action types and exact-target restoration.
- `frontend/src/components/FootprintDetailModal.jsx` - compose the new sheet and preserve read/realtime behavior.
- `frontend/src/components/ReactionPicker.jsx` - accessible Natural City reaction control.
- `frontend/src/App.jsx` - pass viewer and login-restoration context into detail.
- `frontend/src/components/AdminPanel.jsx` - reports tab.
- `frontend/src/styles/tokens.css` - detail-sheet, conversation, menu, and reduced-motion styles.
- Existing focused tests under `frontend/src/components/__tests__`, `frontend/src/hooks/__tests__`, and `frontend/src/__tests__`.

**Do not modify**

- Visibility/discovery expiry semantics, Activity ranking, check-in privacy defaults, stranger messaging/blocking, profile/Me surfaces, deployment configuration, or the geography backfill script.

---

### Task 1: Define the Two-Level Comment Contract

**Files:**

- Modify: `backend/models/Footprint.js`
- Modify: `backend/validators/schemas.js`
- Create: `backend/__tests__/footprint-conversation-service.test.js`

- [ ] **Step 1: Write failing schema and legacy-compatibility tests**

Create service tests using the existing Jest model-mocking pattern. The first cases must assert that a legacy comment is top-level, a reply carries both parent and direct target IDs, and invalid ObjectId strings fail validation:

```js
const { comment } = require('../validators/schemas');

test('accepts a top-level comment and a two-level reply', () => {
  expect(comment.parse({ content: '第一条' })).toEqual({ content: '第一条' });
  const reply = comment.parse({
    content: '回复你',
    parentCommentId: '507f1f77bcf86cd799439011',
    replyToCommentId: '507f1f77bcf86cd799439012',
  });
  expect(reply.parentCommentId).toBe('507f1f77bcf86cd799439011');
  expect(reply.replyToCommentId).toBe('507f1f77bcf86cd799439012');
});

test('rejects a direct reply without its top-level parent', () => {
  expect(() => comment.parse({
    content: 'broken',
    replyToCommentId: '507f1f77bcf86cd799439012',
  })).toThrow();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test --prefix backend -- footprint-conversation-service.test.js --runInBand`

Expected: FAIL because the comment schema strips or rejects the new reply fields.

- [ ] **Step 3: Extend the embedded schema and Zod contract**

Add these fields to each embedded comment in `Footprint.js`:

```js
parentCommentId: { type: mongoose.Schema.Types.ObjectId, default: null },
replyToCommentId: { type: mongoose.Schema.Types.ObjectId, default: null },
replyToUser: {
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  username: { type: String, default: '', maxlength: 30 },
},
isDeleted: { type: Boolean, default: false },
deletedAt: { type: Date, default: null },
```

Replace the validator with:

```js
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const comment = z.object({
  content: z.string().trim().min(1, messageSchema.empty).max(500, messageSchema.tooLong(500)),
  parentCommentId: objectId.optional(),
  replyToCommentId: objectId.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.replyToCommentId && !value.parentCommentId) {
    ctx.addIssue({ code: 'custom', path: ['parentCommentId'], message: 'Reply parent is required' });
  }
});
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test --prefix backend -- footprint-conversation-service.test.js --runInBand`

Expected: PASS for the contract tests.

- [ ] **Step 5: Commit**

```powershell
git add backend/models/Footprint.js backend/validators/schemas.js backend/__tests__/footprint-conversation-service.test.js
git commit -m "feat: define two-level footprint comments"
```

---

### Task 2: Enforce Comment Depth, Ordering, and Deletion Permissions

**Files:**

- Modify: `backend/services/FootprintService.js`
- Modify: `backend/routes/api.js`
- Test: `backend/__tests__/footprint-conversation-service.test.js`

- [ ] **Step 1: Add failing service tests**

Cover these concrete behaviors with mocked readable footprints:

```js
test.each([
  ['missing parent', { parentCommentId: unknownId, replyToCommentId: unknownId }, 404],
  ['third level', { parentCommentId: rootId, replyToCommentId: nestedReplyId }, 400],
])('rejects %s replies', async (_label, input, status) => {
  await expect(service.comment(
    footprintId, viewer.id, viewer.name, input.content || 'reply', '',
    { viewer, parentCommentId: input.parentCommentId, replyToCommentId: input.replyToCommentId },
  )).rejects.toMatchObject({ statusCode: status });
});

test('orders roots and replies by createdAt then _id', async () => {
  const result = await service.getById(footprintId, { viewer });
  expect(result.comments.map((item) => item._id.toString())).toEqual([olderRootId, newerRootId]);
  expect(result.comments[0].replies.map((item) => item._id.toString())).toEqual([olderReplyId, newerReplyId]);
});

test('does not let a footprint owner delete another user comment', async () => {
  await expect(service.deleteComment(
    footprintId, commentId, footprintOwner.id, footprintOwner.name, { viewer: footprintOwner },
  )).rejects.toMatchObject({ statusCode: 403 });
});

test('keeps an anonymized root placeholder when replies exist', async () => {
  const result = await service.deleteComment(
    footprintId, rootId, rootAuthor.id, rootAuthor.name, { viewer: rootAuthor },
  );
  const root = result.footprint.comments.find((item) => item._id.toString() === rootId);
  expect(root).toMatchObject({ isDeleted: true, username: '已删除用户', content: '' });
  expect(root.replies).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test --prefix backend -- footprint-conversation-service.test.js --runInBand`

Expected: FAIL because comments are appended flat, unsorted, and deletion has no placeholder behavior.

- [ ] **Step 3: Add focused conversation helpers in `FootprintService.js`**

Implement and export for tests:

```js
function compareChronological(left, right) {
  const time = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  return time || String(left._id).localeCompare(String(right._id));
}

function buildCommentTree(comments = []) {
  const roots = comments.filter((comment) => !comment.parentCommentId).sort(compareChronological);
  const replies = comments.filter((comment) => comment.parentCommentId).sort(compareChronological);
  return roots.map((root) => ({
    ...root,
    replies: replies.filter((reply) => String(reply.parentCommentId) === String(root._id)),
  }));
}
```

Before saving a reply, load `parent` and `replyTarget` from `fp.comments`. Require `parent.parentCommentId == null`, require the direct target to be either the parent or one of its replies, and store the direct target’s server-derived user ID/name. Pass `parentCommentId` and `replyToCommentId` from the validated route body into the service options.

For deletion, authorize with:

```js
const isAuthor = String(comment.userId || '') === String(userId);
const isAdmin = viewer?.role === 'admin';
if (!isAuthor && !isAdmin) throw new AppError(403, '无权删除此评论');
```

When a root has replies, set `userId = undefined`, `username = '已删除用户'`, `content = ''`, `ipAddress = ''`, `isDeleted = true`, and `deletedAt = new Date()`. Otherwise pull only the selected comment. Decorate all detail/mutation responses with `buildCommentTree` after sanitization.

- [ ] **Step 4: Run service and visibility regression tests**

```powershell
npm.cmd test --prefix backend -- footprint-conversation-service.test.js footprint-http-visibility.test.js footprint-visibility-policy.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/FootprintService.js backend/routes/api.js backend/__tests__/footprint-conversation-service.test.js
git commit -m "feat: enforce public conversation rules"
```

---

### Task 3: Add Report Persistence and Moderation Service

**Files:**

- Create: `backend/models/Report.js`
- Create: `backend/services/ReportService.js`
- Modify: `backend/models/AuditLog.js`
- Modify: `backend/services/AuditService.js`
- Create: `backend/__tests__/report-service.test.js`

- [ ] **Step 1: Write failing report-domain tests**

```js
test('creates one pending report per reporter and target', async () => {
  Report.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingReport);
  Report.create.mockResolvedValue(existingReport);
  const first = await service.submit({ viewer, targetType: 'footprint', targetId, reason: 'spam' });
  const second = await service.submit({ viewer, targetType: 'footprint', targetId, reason: 'spam' });
  expect(first.report._id).toEqual(second.report._id);
  expect(Report.create).toHaveBeenCalledTimes(1);
});

test('rejects self reporting and unreadable targets', async () => {
  await expect(service.submit({ viewer: owner, targetType: 'footprint', targetId, reason: 'spam' }))
    .rejects.toMatchObject({ statusCode: 400 });
  await expect(service.submit({ viewer: stranger, targetType: 'footprint', targetId: hiddenId, reason: 'spam' }))
    .rejects.toMatchObject({ statusCode: 404 });
});

test('requires an explicit admin resolution and records audit', async () => {
  await service.resolve({ reportId, reviewer: admin, resolution: 'dismiss' });
  expect(report.status).toBe('dismissed');
  expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'report_dismiss' }));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix backend -- report-service.test.js --runInBand`

Expected: FAIL because the model and service do not exist.

- [ ] **Step 3: Create the report model**

Use this contract in `Report.js`:

```js
const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['footprint', 'comment'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  footprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Footprint', required: true },
  reason: { type: String, enum: ['spam', 'harassment', 'privacy', 'illegal', 'other'], required: true },
  details: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['pending', 'actioned', 'dismissed'], default: 'pending' },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  resolution: { type: String, default: '', maxlength: 80 },
}, { timestamps: true });

reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_report_per_target' },
);
reportSchema.index({ status: 1, createdAt: -1, _id: -1 });
```

- [ ] **Step 4: Implement `ReportService`**

`submit` must resolve the footprint/comment target, call `getReadableFootprint`, reject owner/self targets, return an existing pending report before creating, and normalize duplicate-key races by loading the winner. `listPending` returns newest-first populated reporter/footprint context. `resolve` accepts only `dismiss` or `delete`; delete calls the existing administrator deletion path for the target, then sets `actioned`, while dismiss sets `dismissed`. Both set reviewer metadata and await `AuditService.log`.

Add `report_action` and `report_dismiss` to both audit enums.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test --prefix backend -- report-service.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/models/Report.js backend/services/ReportService.js backend/models/AuditLog.js backend/services/AuditService.js backend/__tests__/report-service.test.js
git commit -m "feat: add report moderation domain"
```

---

### Task 4: Expose Report and Admin HTTP Contracts

**Files:**

- Create: `backend/routes/reports.js`
- Modify: `backend/routes/admin.js`
- Modify: `backend/routes/api.js`
- Modify: `backend/validators/schemas.js`
- Create: `backend/__tests__/report-http.test.js`

- [ ] **Step 1: Write failing Supertest cases**

Assert `401` for guest submission, `201` for the first valid report, `200` with the same report for a duplicate, `403` for non-admin list/resolve, and `400` for invalid reason/resolution.

```js
await request(app).post('/api/reports').send(validReport).expect(401);
await request(app).post('/api/reports').set(auth(viewer)).send(validReport).expect(201);
await request(app).get('/api/admin/reports').set(auth(viewer)).expect(403);
await request(app).put(`/api/admin/reports/${reportId}`).set(auth(admin))
  .send({ resolution: 'dismiss' }).expect(200);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix backend -- report-http.test.js --runInBand`

Expected: FAIL with missing routes.

- [ ] **Step 3: Add strict validators and routes**

Add and export:

```js
const report = z.object({
  targetType: z.enum(['footprint', 'comment']),
  targetId: objectId,
  footprintId: objectId.optional(),
  reason: z.enum(['spam', 'harassment', 'privacy', 'illegal', 'other']),
  details: z.string().trim().max(500).optional(),
}).strict();

const reportResolution = z.object({ resolution: z.enum(['dismiss', 'delete']) }).strict();
```

Mount `reports.js` from `api.js`. The public router uses `auth`, `contentLimiter`, and `validate(report)`. Add admin list and resolve routes under the existing `/admin` middleware and validate resolution before invoking `ReportService`.

- [ ] **Step 4: Run HTTP and full backend tests**

```powershell
npm.cmd test --prefix backend -- report-http.test.js footprint-conversation-service.test.js --runInBand
npm.cmd test --prefix backend
```

Expected: all backend suites PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/reports.js backend/routes/admin.js backend/routes/api.js backend/validators/schemas.js backend/__tests__/report-http.test.js
git commit -m "feat: expose footprint reporting APIs"
```

---

### Task 5: Build Shared Frontend Conversation State and Cache Actions

**Files:**

- Create: `frontend/src/domain/footprintConversation.js`
- Create: `frontend/src/domain/__tests__/footprintConversation.test.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/hooks/socketHandlers.js`
- Modify: `frontend/src/hooks/useFootprintActions.js`
- Modify: `frontend/src/contexts/FootprintActionsContext.jsx`
- Test: `frontend/src/hooks/__tests__/socketHandlers.test.js`

- [ ] **Step 1: Write failing helper/cache tests**

```js
expect(buildCommentTree([newerRoot, reply, olderRoot])).toEqual([
  { ...olderRoot, replies: [] },
  { ...newerRoot, replies: [reply] },
]);
expect(commentPermissions({ comment: mine, viewerId: 'u1', isAdmin: false }))
  .toEqual({ canDelete: true, canReport: false });

replaceFootprintInCaches(queryClient, updated, 'user:u1');
expect(queryClient.getQueryData(mapKey).footprints[0].comments).toEqual(updated.comments);
expect(queryClient.getQueryData(activityKey).pages[0].items[0].comments).toEqual(updated.comments);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- footprintConversation.test.js socketHandlers.test.js`

Expected: FAIL because helpers are absent and cache replacement is private.

- [ ] **Step 3: Implement deterministic helpers**

Export `buildCommentTree`, `commentPermissions`, and `footprintPermissions`. Normalize both flat backend comments and already-decorated `{ replies }` responses, sort by timestamp/ID, hide report on owned/deleted content, and expose delete only for owner/admin.

Export `replaceFootprintInCaches(queryClient, footprint, viewer)` from `socketHandlers.js`; reuse `updateCachedFootprints` for Map and Activity and set `['footprints', 'detail', footprint._id, viewerIdentity]` when that query exists.

- [ ] **Step 4: Expand the API/action contract**

Use these clients:

```js
comment(id, { content, parentCommentId, replyToCommentId } = {}) {
  return api.post(`/api/footprints/${id}/comment`, { content, parentCommentId, replyToCommentId });
},
report(data) { return api.post('/api/reports', data); },
```

Refactor `useFootprintActions` to call `replaceFootprintInCaches` after reaction/comment/delete-comment mutations, update the legacy `setFootprints` compatibility array, return the server footprint, and rethrow errors so components can preserve drafts and show retry state. Add `handleReport` with `requireLogin({ type: 'report', footprintId, targetType, targetId })`.

- [ ] **Step 5: Run focused tests and typecheck**

```powershell
npm.cmd test --prefix frontend -- footprintConversation.test.js socketHandlers.test.js
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/domain/footprintConversation.js frontend/src/domain/__tests__/footprintConversation.test.js frontend/src/api.js frontend/src/hooks/socketHandlers.js frontend/src/hooks/useFootprintActions.js frontend/src/contexts/FootprintActionsContext.jsx frontend/src/hooks/__tests__/socketHandlers.test.js
git commit -m "feat: add shared footprint conversation actions"
```

---

### Task 6: Preserve Pending Reply and Report Actions Across Login

**Files:**

- Modify: `frontend/src/hooks/useAuth.ts`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/hooks/__tests__/useAuth.test.tsx`
- Test: `frontend/src/__tests__/App.mobile-shell.test.jsx`

- [ ] **Step 1: Write failing login-restoration tests**

Assert that a guest reply stores the exact footprint/comment target and draft without executing; after authentication, detail reopens once and the draft is restored without automatic submission.

```tsx
act(() => result.current.requireLogin({
  type: 'reply', footprintId: 'fp-1', targetId: 'c-1', draft: '继续聊', source: 'activity',
}));
expect(result.current.pendingActionRef.current).toMatchObject({ type: 'reply', targetId: 'c-1' });

rerenderAuthenticated();
expect(openFootprintConversation).toHaveBeenCalledWith(expect.objectContaining({
  footprintId: 'fp-1', targetId: 'c-1', draft: '继续聊',
}));
expect(submitComment).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- useAuth.test.tsx App.mobile-shell.test.jsx`

Expected: FAIL because pending actions support only check-in/comment/react and Activity targets are not restored with drafts.

- [ ] **Step 3: Extend the typed pending action**

Use:

```ts
interface PendingAction {
  type: 'checkin' | 'comment' | 'reply' | 'react' | 'report';
  footprintId?: string;
  targetType?: 'footprint' | 'comment';
  targetId?: string;
  draft?: string;
  source?: 'activity' | 'map';
}
```

Expose a one-shot `consumePendingAction()` callback from `useAuth`. App consumes it after login, restores `activityDetailFp` or the map active footprint, and passes the pending draft/target into `FootprintDetailModal`. The composer consumes that restoration once; it never submits automatically.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm.cmd test --prefix frontend -- useAuth.test.tsx App.mobile-shell.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/hooks/useAuth.ts frontend/src/App.jsx frontend/src/hooks/__tests__/useAuth.test.tsx frontend/src/__tests__/App.mobile-shell.test.jsx
git commit -m "feat: restore footprint interactions after login"
```

---

### Task 7: Build the Natural City Detail Sheet and Conversation UI

**Required skills before editing:** `frontend-design` and `impeccable` (craft/polish guidance), then `superpowers:test-driven-development`.

**Files:**

- Create: `frontend/src/components/footprint/FootprintDetailSheet.jsx`
- Create: `frontend/src/components/footprint/FootprintConversation.jsx`
- Create: `frontend/src/components/footprint/ModerationMenu.jsx`
- Create focused component tests under `frontend/src/components/footprint/__tests__/`
- Modify: `frontend/src/components/FootprintDetailModal.jsx`
- Modify: `frontend/src/components/ReactionPicker.jsx`
- Modify: `frontend/src/styles/tokens.css`
- Test: `frontend/src/components/__tests__/FootprintDetailModal.test.jsx`

- [ ] **Step 1: Run the Impeccable context scan before UI changes**

Use the skill-provided context and detector commands on `FootprintDetailModal.jsx`, `CommentSection.jsx`, `ReactionPicker.jsx`, and `tokens.css`. Record findings in the QA checklist draft; do not change files before the RED tests.

- [ ] **Step 2: Write failing sheet, conversation, and menu tests**

Cover semantic dialog naming, 72%/expanded state contract, Escape/close, oldest-first immediate comments, one-level reply label, 44px composer controls, preserved draft on failure, More-menu permission visibility, and guest gating.

```jsx
expect(screen.getByRole('dialog', { name: '足迹详情' })).toHaveAttribute('data-snap', 'default');
await user.click(screen.getByRole('button', { name: '展开详情' }));
expect(screen.getByRole('dialog', { name: '足迹详情' })).toHaveAttribute('data-snap', 'expanded');

expect(screen.getAllByTestId('comment').map((node) => node.dataset.commentId))
  .toEqual(['root-old', 'reply-old', 'root-new']);
await user.click(screen.getByRole('button', { name: '回复 小林' }));
expect(screen.getByLabelText('回复内容')).toHaveValue('');

expect(screen.queryByRole('menuitem', { name: '删除评论' })).not.toBeInTheDocument();
expect(screen.getByRole('menuitem', { name: '举报评论' })).toBeInTheDocument();
```

- [ ] **Step 3: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- FootprintDetailSheet.test.jsx FootprintConversation.test.jsx ModerationMenu.test.jsx FootprintDetailModal.test.jsx`

Expected: FAIL because the new components do not exist and the legacy modal is centered/dark.

- [ ] **Step 4: Implement the sheet and component boundaries**

`FootprintDetailSheet` renders `role="dialog"`, `aria-modal="true"`, a labelled header, a fixed mobile bottom sheet, an expand/collapse icon button, close button, Escape handling, and a Framer Motion y/opacity transition disabled under reduced motion. Use stable `data-snap="default|expanded"` for tests and CSS.

`FootprintConversation` renders roots and replies directly, an inline reply banner, a sticky keyboard-safe composer, and per-operation status. On rejection it keeps the draft and exposes `重试发送`; successful submission clears only the submitted draft.

`ModerationMenu` uses Lucide `MoreHorizontal`, `Flag`, and `Trash2`, correct ARIA menu roles, click-outside/Escape close, a reason selector, optional details, and explicit confirmation for destructive deletion. It never renders unauthorized menu items.

- [ ] **Step 5: Apply the approved Natural City visual system**

Add `.bliver-detail-*`, `.bliver-conversation-*`, and `.bliver-moderation-*` classes to `tokens.css`: paper/surface/forest/sage colors, one soft sheet shadow, borders instead of nested cards, 44px controls, `max-height: 72dvh` default and `94dvh` expanded, safe-area bottom padding, desktop max-width, overflow wrapping, and reduced-motion removal. Keep coral out of ordinary reaction/comment controls.

Refactor `FootprintDetailModal` to retain authoritative read marking and realtime close behavior, then compose the new sheet/content/actions. Replace the hover-only reaction picker with click/tap and keyboard behavior; preserve one emoji per user and expose counts with accessible labels.

- [ ] **Step 6: Run focused tests, detector, typecheck, and build**

```powershell
npm.cmd test --prefix frontend -- FootprintDetailSheet.test.jsx FootprintConversation.test.jsx ModerationMenu.test.jsx FootprintDetailModal.test.jsx
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
```

Run the Impeccable detector again on changed UI files. Fix behavior findings with a new failing test before implementation; document accepted detector findings.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/footprint frontend/src/components/FootprintDetailModal.jsx frontend/src/components/ReactionPicker.jsx frontend/src/components/__tests__/FootprintDetailModal.test.jsx frontend/src/styles/tokens.css docs/qa/footprint-detail-conversation-checklist.md
git commit -m "feat: redesign footprint detail conversation"
```

---

### Task 8: Add the Administrator Report Queue

**Files:**

- Create: `frontend/src/components/admin/AdminReportsTab.jsx`
- Create: `frontend/src/components/admin/__tests__/AdminReportsTab.test.jsx`
- Modify: `frontend/src/components/AdminPanel.jsx`
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Write failing report queue tests**

```jsx
expect(await screen.findByText('待处理举报')).toBeInTheDocument();
expect(screen.getByText('骚扰')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '保留内容并驳回' }));
expect(apiClient.admin.resolveReport).toHaveBeenCalledWith('report-1', 'dismiss');
await user.click(screen.getByRole('button', { name: '删除内容并处理' }));
expect(screen.getByRole('dialog', { name: '确认删除举报内容' })).toBeInTheDocument();
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test --prefix frontend -- AdminReportsTab.test.jsx`

Expected: FAIL because the tab and clients do not exist.

- [ ] **Step 3: Implement clients and report tab**

Add `admin.reports(opts)` and `admin.resolveReport(reportId, resolution)`. The tab loads only when selected, shows loading/error/empty states, displays reporter/target/reason/time, and requires confirmation for deletion. Successful resolution removes the row; failure keeps it and offers retry.

Add an `举报` tab with a pending-count badge to `AdminPanel`. Do not redesign other admin tabs in Phase 4; only ensure the new tab meets the Natural City token/accessibility contract.

- [ ] **Step 4: Run focused and integration tests**

```powershell
npm.cmd test --prefix frontend -- AdminReportsTab.test.jsx App.mobile-shell.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/components/admin/AdminReportsTab.jsx frontend/src/components/admin/__tests__/AdminReportsTab.test.jsx frontend/src/components/AdminPanel.jsx frontend/src/api.js
git commit -m "feat: add admin report moderation queue"
```

---

### Task 9: Complete Full Verification and Visual Acceptance

**Required skills before claiming completion:** `impeccable` critique/audit/polish as applicable, `frontend-design` self-critique, and `superpowers:verification-before-completion`.

**Files:**

- Modify only evidenced Phase 4 defects in files touched above.
- Complete: `docs/qa/footprint-detail-conversation-checklist.md`

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
```

Expected: every command exits 0. Record exact suite/test counts and any existing non-failing bundle warning.

- [ ] **Step 2: Start a frontend preview without deployment**

Run: `npm.cmd run preview --prefix frontend -- --host 127.0.0.1 --port 4173`

If `4173` is occupied, choose the next free local port. Do not push, deploy, or run a geography backfill command.

- [ ] **Step 3: Inspect required viewports**

Use the in-app browser when reachable and inspect 360x800, 390x844, 430x932, and 1440x1000. Cover default/expanded sheet, no-photo/tall-photo, empty/long comments, reply keyboard, More menu, report form, offline cached state, failed send retry, deleted content, focus order, and reduced motion. Capture and read screenshots; an uninspected screenshot is not evidence.

- [ ] **Step 4: Run Impeccable and frontend-design critique**

Record findings under hierarchy/map preservation, footprint-ring signature, typography/contrast, safe areas/keyboard/long text, motion/reduced motion, menu/error completeness, and prohibited patterns. Add a failing test before any behavioral fix, then re-run the affected viewport.

- [ ] **Step 5: Run the final gate and inspect status**

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
git status --short
```

Expected: all commands pass and status contains only intended Phase 4 QA changes.

- [ ] **Step 6: Commit QA evidence**

```powershell
git add docs/qa/footprint-detail-conversation-checklist.md frontend/src backend
git commit -m "test: verify footprint detail conversation"
```

---

## Completion Criteria

- Map, Activity, and deep links open the same detail sheet while preserving authorized map context.
- Comments are immediately visible, deterministic, chronological, and limited to two levels.
- A footprint author cannot delete another user’s comment; comment authors and administrators have the confirmed permissions.
- Root deletion preserves replies through an anonymized placeholder.
- Reports are authorized, idempotent while pending, explicitly resolved, and audited.
- Guest interaction restores the exact target and draft after login without duplicate submission.
- Reactions/comments/reports update the shared React Query caches without parallel server state.
- Natural City styling, touch targets, focus, safe areas, keyboard behavior, reduced motion, and error states pass focused and browser acceptance.
- Backend/frontend suites, typecheck, build, and diff check pass.
- No push, deployment, or real geography backfill occurs.
