# Bliver Design Foundations and Mobile App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mobile overlay controls with the approved Natural City design foundation, four-destination mobile navigation, and independent check-in action while preserving every existing feature through compatibility callbacks.

**Architecture:** Add a focused shell layer around the existing application instead of rewriting product surfaces in this phase. CSS tokens define the new visual contract, a small Zustand shell slice tracks the active mobile destination, and accessible shell components invoke existing App callbacks for Activity, Messages, Me, and check-in. Desktop controls and all legacy panels remain available until their dedicated redesign phases.

**Tech Stack:** React 19, TypeScript-compatible JSX, Zustand 5, Tailwind CSS 4, Lucide React, Vitest, Testing Library, Vite 8.

---

## Scope and File Map

**Create**
- `frontend/src/styles/tokens.css` — Natural City CSS variables, safe-area variables, focus rules, motion preferences, and shared shell utility classes.
- `frontend/src/store/useShellStore.ts` — mobile destination state only; no server data and no modal state.
- `frontend/src/components/shell/AppShell.jsx` — semantic app frame and content insets.
- `frontend/src/components/shell/MobileTopBar.jsx` — brand, location/scope affordance, and notification entry.
- `frontend/src/components/shell/BottomNavigation.jsx` — four accessible navigation destinations.
- `frontend/src/components/shell/CheckInAction.jsx` — independent coral check-in action.
- `frontend/src/components/shell/LegacyDestinationBridge.jsx` — translates Activity, Messages, and Me destinations into existing timeline/friends/profile/auth actions.
- `frontend/src/components/shell/__tests__/BottomNavigation.test.jsx`
- `frontend/src/components/shell/__tests__/CheckInAction.test.jsx`
- `frontend/src/components/shell/__tests__/LegacyDestinationBridge.test.jsx`
- `frontend/src/components/shell/__tests__/AppShell.test.jsx`
- `frontend/src/__tests__/App.mobile-shell.test.jsx` — integration coverage with heavy product surfaces mocked.

**Modify**
- `frontend/src/main.jsx:5-7` — load tokens before legacy styles; keep `aurora.css` temporarily for unreplaced surfaces.
- `frontend/src/index.css:1-35` — remove duplicate global color/font ownership and delegate to tokens.
- `frontend/src/App.jsx:22-45` — import shell components and remove mobile-only icon imports superseded by the shell.
- `frontend/src/App.jsx:121-139` — read only existing actions needed by the compatibility bridge.
- `frontend/src/App.jsx:200-251` — wrap content with `AppShell`, replace the old mobile top bar, and keep desktop `NavBar` behind `md`.
- `frontend/src/App.jsx:302-352` — preserve map and desktop controls while adding mobile content insets and independent check-in action.
- `frontend/src/App.jsx:397-407` — remove `MobileActionDrawer` from the mobile core path; retain the component file until later cleanup.
- `frontend/src/test-setup.js` — add deterministic `matchMedia` and safe browser API stubs used by shell tests.

**Do not modify in this phase**
- Backend files, database models, API contracts, Socket.IO behavior, footprint discovery, message permissions, or historical data.
- Existing timeline, friends, profile, notification, photo wall, announcement, admin, or chat implementations beyond invoking them through the bridge.

---

### Task 1: Establish a Node 20 Verification Baseline

**Files:**
- Modify: `README.md:35-55`
- Modify: `package.json:6-14`
- Create: `.nvmrc`

- [ ] **Step 1: Write the version assertion script**

Add this script to the root `package.json`:

```json
{
  "scripts": {
    "check:node": "node -e "const major=Number(process.versions.node.split('.')[0]); if(major!==20){console.error('Bliver requires Node.js 20.x; found '+process.version); process.exit(1)}""
  }
}
```

Create `.nvmrc` containing exactly:

```text
20
```

- [ ] **Step 2: Run the assertion to verify the current machine fails clearly**

Run:

```powershell
npm.cmd run check:node
```

Expected on the current machine: FAIL with `Bliver requires Node.js 20.x; found v24...`.

- [ ] **Step 3: Document the supported runtime**

Update README environment requirements to state:

```markdown
- Node.js 20.x (matches GitHub Actions and mongodb-memory-server support)
- npm 10+
```

Document Windows usage with `npm.cmd` when PowerShell execution policy blocks `npm.ps1`.

- [ ] **Step 4: Verify under Node 20 before continuing**

Install or activate Node 20, then run:

```powershell
npm.cmd run check:node
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
```

Expected: all commands PASS. Do not continue shell implementation while backend tests are skipped or running under Node 24.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc package.json README.md
git commit -m "chore: standardize development on node 20"
```

---

### Task 2: Add Natural City Design Tokens

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/main.jsx:5-7`
- Modify: `frontend/src/index.css:1-35`
- Test: `frontend/src/components/shell/__tests__/AppShell.test.jsx`

- [ ] **Step 1: Write a failing token contract test**

Create `AppShell.test.jsx` with the initial test:

```jsx
import { render } from '@testing-library/react';
import AppShell from '../AppShell';

it('uses the Natural City shell contract', () => {
  const { container } = render(<AppShell><div>Map</div></AppShell>);
  const shell = container.firstChild;
  expect(shell).toHaveClass('bliver-shell');
  expect(shell).toHaveAttribute('data-design-system', 'natural-city');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test --prefix frontend -- AppShell.test.jsx
```

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Create the token file**

Create `frontend/src/styles/tokens.css` with this foundation:

```css
:root {
  color-scheme: light;
  --bliver-forest: #173b31;
  --bliver-forest-soft: #2d594d;
  --bliver-sage: #a9c9bf;
  --bliver-sage-soft: #e5eee9;
  --bliver-paper: #faf8f3;
  --bliver-surface: #ffffff;
  --bliver-ink: #1e2925;
  --bliver-muted: #5d7068;
  --bliver-coral: #f26a4b;
  --bliver-coral-active: #d9563a;
  --bliver-border: #d7e1dc;
  --bliver-danger: #b83b3b;
  --bliver-shadow-card: 0 16px 40px rgba(23, 59, 49, 0.14);
  --bliver-shadow-float: 0 12px 30px rgba(23, 59, 49, 0.2);
  --bliver-radius-sm: 10px;
  --bliver-radius-md: 16px;
  --bliver-radius-lg: 24px;
  --bliver-safe-top: env(safe-area-inset-top, 0px);
  --bliver-safe-right: env(safe-area-inset-right, 0px);
  --bliver-safe-bottom: env(safe-area-inset-bottom, 0px);
  --bliver-safe-left: env(safe-area-inset-left, 0px);
  --bliver-nav-height: 64px;
  --bliver-motion-fast: 150ms;
  --bliver-motion-base: 220ms;
  font-family: Inter, "Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bliver-paper);
  color: var(--bliver-ink);
}

*, *::before, *::after { box-sizing: border-box; }

:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--bliver-forest) 45%, white);
  outline-offset: 3px;
}

.bliver-shell {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--bliver-paper);
  color: var(--bliver-ink);
}

.bliver-shell__content {
  position: absolute;
  inset: 0;
}

@media (max-width: 767px) {
  .bliver-shell__content {
    padding-bottom: calc(var(--bliver-nav-height) + var(--bliver-safe-bottom));
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

- [ ] **Step 4: Load tokens before legacy styles**

Change `main.jsx` imports to:

```jsx
import './styles/tokens.css';
import './index.css';
import './aurora.css';
```

Keep `aurora.css` because unreplaced legacy surfaces still depend on it. Remove global font/background declarations from `index.css` that conflict with token ownership.

- [ ] **Step 5: Create the minimal AppShell implementation**

Create `AppShell.jsx`:

```jsx
export default function AppShell({ children }) {
  return (
    <div className="bliver-shell" data-design-system="natural-city">
      <main className="bliver-shell__content">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Run focused verification**

Run:

```powershell
npm.cmd test --prefix frontend -- AppShell.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/main.jsx frontend/src/index.css frontend/src/components/shell/AppShell.jsx frontend/src/components/shell/__tests__/AppShell.test.jsx
git commit -m "feat: add natural city design foundation"
```

---

### Task 3: Add a Focused Mobile Shell Store

**Files:**
- Create: `frontend/src/store/useShellStore.ts`
- Create: `frontend/src/store/__tests__/useShellStore.test.ts`

- [ ] **Step 1: Write failing store tests**

```ts
import useShellStore from '../useShellStore';

beforeEach(() => {
  useShellStore.setState({ activeDestination: 'map' });
});

it('starts on map', () => {
  expect(useShellStore.getState().activeDestination).toBe('map');
});

it('changes only to supported destinations', () => {
  useShellStore.getState().setActiveDestination('activity');
  expect(useShellStore.getState().activeDestination).toBe('activity');
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```powershell
npm.cmd test --prefix frontend -- useShellStore.test.ts
```

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement the store**

```ts
import { create } from 'zustand';

export type MobileDestination = 'map' | 'activity' | 'messages' | 'me';

interface ShellStore {
  activeDestination: MobileDestination;
  setActiveDestination: (destination: MobileDestination) => void;
}

const useShellStore = create<ShellStore>((set) => ({
  activeDestination: 'map',
  setActiveDestination: (activeDestination) => set({ activeDestination }),
}));

export default useShellStore;
```

Do not persist this state and do not add modal flags or server data.

- [ ] **Step 4: Run tests and typecheck**

```powershell
npm.cmd test --prefix frontend -- useShellStore.test.ts
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/useShellStore.ts frontend/src/store/__tests__/useShellStore.test.ts
git commit -m "feat: add mobile shell navigation state"
```

---

### Task 4: Build the Four-Destination Bottom Navigation

**Files:**
- Create: `frontend/src/components/shell/BottomNavigation.jsx`
- Test: `frontend/src/components/shell/__tests__/BottomNavigation.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write failing behavior and accessibility tests**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomNavigation from '../BottomNavigation';

it('renders exactly four top-level destinations', () => {
  render(<BottomNavigation activeDestination="map" onDestinationChange={() => {}} />);
  expect(screen.getAllByRole('button')).toHaveLength(4);
  expect(screen.getByRole('button', { name: '地图' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: '动态' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '消息' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我的' })).toBeInTheDocument();
});

it('reports the selected destination', async () => {
  const user = userEvent.setup();
  const onDestinationChange = vi.fn();
  render(<BottomNavigation activeDestination="map" onDestinationChange={onDestinationChange} />);
  await user.click(screen.getByRole('button', { name: '动态' }));
  expect(onDestinationChange).toHaveBeenCalledWith('activity');
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm.cmd test --prefix frontend -- BottomNavigation.test.jsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement navigation**

Use `Map`, `Compass`, `MessageCircle`, and `UserRound` from Lucide. Render a semantic `nav aria-label="主要导航"`; each destination is a 44px minimum button with text and icon. Use `aria-current="page"` only on the active destination.

The component contract is:

```jsx
<BottomNavigation
  activeDestination="map"
  unreadMessages={0}
  onDestinationChange={(destination) => {}}
/>
```

Cap the unread badge at `99+` and provide an accessible label such as `消息，3 条未读`.

- [ ] **Step 4: Add shell navigation CSS**

Add classes for a fixed mobile-only bottom navigation using warm surface, forest selected state, a top border, safe-area padding, and no blur/glow. Hide it at `min-width: 768px`.

- [ ] **Step 5: Run focused tests**

```powershell
npm.cmd test --prefix frontend -- BottomNavigation.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shell/BottomNavigation.jsx frontend/src/components/shell/__tests__/BottomNavigation.test.jsx frontend/src/styles/tokens.css
git commit -m "feat: add accessible mobile bottom navigation"
```

---

### Task 5: Build the Mobile Top Bar and Independent Check-in Action

**Files:**
- Create: `frontend/src/components/shell/MobileTopBar.jsx`
- Create: `frontend/src/components/shell/CheckInAction.jsx`
- Test: `frontend/src/components/shell/__tests__/CheckInAction.test.jsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Write the failing check-in test**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckInAction from '../CheckInAction';

it('is a primary action, not a navigation item', async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(<CheckInAction onPress={onPress} />);
  const button = screen.getByRole('button', { name: '发布足迹' });
  expect(button.closest('nav')).toBeNull();
  await user.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm.cmd test --prefix frontend -- CheckInAction.test.jsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement CheckInAction**

Render a coral 56px action using `MapPinPlus`. The visible label may be `打卡`, but the accessible name is `发布足迹`. Position it above the bottom navigation and safe area. Accept `disabled` and expose `aria-disabled`.

- [ ] **Step 4: Implement MobileTopBar**

Contract:

```jsx
<MobileTopBar
  locationLabel="当前位置"
  unreadNotifications={0}
  onBrandPress={openAbout}
  onLocationPress={() => {}}
  onNotificationsPress={toggleNotifs}
/>
```

Use the Bliver wordmark on the left, a location/scope button in the center, and a bell button on the right. Each control is at least 44px. Do not add a hamburger menu. When location selection is not implemented, the button remains enabled only if it opens the existing period/timeline control; otherwise render it as text with no false affordance.

- [ ] **Step 5: Add styles and reduced-motion behavior**

Use warm surfaces, forest ink, soft shadows, and coral only for the check-in action. Active transforms must be subtle and removed under reduced motion.

- [ ] **Step 6: Run tests and typecheck**

```powershell
npm.cmd test --prefix frontend -- CheckInAction.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shell/MobileTopBar.jsx frontend/src/components/shell/CheckInAction.jsx frontend/src/components/shell/__tests__/CheckInAction.test.jsx frontend/src/styles/tokens.css
git commit -m "feat: add mobile top bar and check-in action"
```

---

### Task 6: Add the Legacy Destination Compatibility Bridge

**Files:**
- Create: `frontend/src/components/shell/LegacyDestinationBridge.jsx`
- Test: `frontend/src/components/shell/__tests__/LegacyDestinationBridge.test.jsx`

- [ ] **Step 1: Write failing bridge tests**

```jsx
import { render } from '@testing-library/react';
import LegacyDestinationBridge from '../LegacyDestinationBridge';

const actions = {
  openTimeline: vi.fn(),
  openFriends: vi.fn(),
  openProfile: vi.fn(),
  openAuth: vi.fn(),
};

afterEach(() => vi.clearAllMocks());

it('opens the existing timeline for Activity', () => {
  render(<LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />);
  expect(actions.openTimeline).toHaveBeenCalledTimes(1);
});

it('opens the existing friends/messages surface for Messages', () => {
  render(<LegacyDestinationBridge destination="messages" user={{ _id: 'u1' }} {...actions} />);
  expect(actions.openFriends).toHaveBeenCalledTimes(1);
});

it('opens the current user profile for Me', () => {
  render(<LegacyDestinationBridge destination="me" user={{ _id: 'u1' }} {...actions} />);
  expect(actions.openProfile).toHaveBeenCalledWith('u1');
});

it('requests login when Me is selected by a guest', () => {
  render(<LegacyDestinationBridge destination="me" user={null} {...actions} />);
  expect(actions.openAuth).toHaveBeenCalledWith('login', '登录后查看个人主页');
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm.cmd test --prefix frontend -- LegacyDestinationBridge.test.jsx
```

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement a side-effect-only bridge**

Use `useEffect` and call exactly one legacy action when `destination` changes away from map. After dispatching, call `onHandled('map')` so the shell returns to Map while the existing drawer or panel is open.

```jsx
const handlers = {
  activity: () => openTimeline(),
  messages: () => user ? openFriends() : openAuth('login', '登录后查看消息'),
  me: () => user ? openProfile(user._id) : openAuth('login', '登录后查看个人主页'),
};
```

The bridge renders `null`. It must not contain styling or duplicate legacy state.

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test --prefix frontend -- LegacyDestinationBridge.test.jsx
npm.cmd run typecheck --prefix frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shell/LegacyDestinationBridge.jsx frontend/src/components/shell/__tests__/LegacyDestinationBridge.test.jsx
git commit -m "feat: bridge new navigation to legacy surfaces"
```

---

### Task 7: Integrate the Shell into App Without Breaking Existing Features

**Files:**
- Modify: `frontend/src/App.jsx:22-45,121-139,200-251,302-352,397-407`
- Modify: `frontend/src/components/shell/AppShell.jsx`
- Modify: `frontend/src/test-setup.js`
- Create: `frontend/src/__tests__/App.mobile-shell.test.jsx`

- [ ] **Step 1: Add deterministic browser stubs**

Append to `test-setup.js`:

```js
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

- [ ] **Step 2: Write the failing App integration test**

Mock heavy product components and hooks so the test asserts shell composition only. The key assertions are:

```jsx
expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '发布足迹' })).toBeInTheDocument();
expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
expect(screen.getByTestId('map-view')).toBeInTheDocument();
```

Add a second test that clicks `动态` and expects the mocked existing Timeline action/surface to open.

- [ ] **Step 3: Run to verify failure**

```powershell
npm.cmd test --prefix frontend -- App.mobile-shell.test.jsx
```

Expected: FAIL because App still renders the old mobile controls.

- [ ] **Step 4: Extend AppShell composition**

Use this contract:

```jsx
<AppShell
  topBar={<MobileTopBar ... />}
  bottomNavigation={<BottomNavigation ... />}
  primaryAction={<CheckInAction ... />}
>
  {mapAndLegacySurfaces}
</AppShell>
```

AppShell renders top bar, primary action, and bottom navigation outside `main` so overlays do not alter map sizing.

- [ ] **Step 5: Replace the old mobile controls in App**

- Import `useShellStore`, `AppShell`, `MobileTopBar`, `BottomNavigation`, `CheckInAction`, and `LegacyDestinationBridge`.
- Remove the old hand-built mobile top bar block and remove `MobileActionDrawer` rendering.
- Keep desktop `NavBar`, but wrap it in `hidden md:block` if it does not already hide itself.
- Keep all existing panels and modals unchanged.
- Wire check-in through the existing `requireLogin({ type: 'checkin' })` guard before `openCheckIn()`.
- Derive unread message count from the existing `totalFriendUnread` value.
- Wire notification entry to the existing `toggleNotifs` action.
- Wire Activity, Messages, and Me through `LegacyDestinationBridge`.

- [ ] **Step 6: Preserve map sizing and pointer behavior**

Remove `touchAction: 'none'` from the entire shell. Apply map-specific gesture behavior inside `MapView` only. Verify bottom navigation and top controls receive pointer events while the map remains pannable elsewhere.

- [ ] **Step 7: Run focused and full frontend verification**

```powershell
npm.cmd test --prefix frontend -- App.mobile-shell.test.jsx
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
```

Expected: all PASS. The build may still warn about the large main chunk; route splitting is a later phase.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/shell/AppShell.jsx frontend/src/test-setup.js frontend/src/__tests__/App.mobile-shell.test.jsx
git commit -m "feat: integrate natural city mobile app shell"
```

---

### Task 8: Perform Mobile Visual and Interaction Regression

**Files:**
- Modify only files already introduced in Tasks 2–7 when a verified defect requires correction.
- Create: `docs/qa/mobile-shell-checklist.md`

- [ ] **Step 1: Create the manual QA checklist**

Document these exact checks:

```markdown
# Mobile Shell QA

## Viewports
- 360×800 small Android
- 390×844 canonical phone
- 430×932 large phone
- 1440×1000 desktop compatibility

## Guest
- Map loads and remains pannable outside controls.
- Bottom navigation has exactly Map, Activity, Messages, Me.
- Check-in requests login and does not open an unauthenticated form.
- Messages and Me request login with actionable copy.
- No hamburger menu appears on mobile.

## Authenticated
- Check-in opens the existing CheckInModal.
- Activity opens the existing TimelineDrawer.
- Messages opens the existing friends/message entry.
- Me opens the current user's profile.
- Notification badge and message badge remain accurate.

## Accessibility
- Every shell control is at least 44×44 CSS pixels.
- Keyboard focus is visible.
- Screen-reader names are meaningful.
- Reduced motion removes transform animation.
- Bottom navigation clears the home indicator safe area.
```

- [ ] **Step 2: Capture mobile and desktop screenshots**

Run the local production build on port 5000 and use Chrome/Playwright with the installed system Chrome to capture the four viewports. Save temporary screenshots under `.local-runtime/`; do not commit them.

- [ ] **Step 3: Verify computed interaction sizes**

Use Playwright to assert every `[data-shell-control]` element has a bounding box of at least 44px by 44px. Fail the QA script if any control is smaller.

- [ ] **Step 4: Run complete verification**

```powershell
npm.cmd run check:node
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git status --short
```

Expected: all automated checks PASS; Git shows only intended source, test, documentation, `PRODUCT.md`, and `DESIGN.md` changes.

- [ ] **Step 5: Commit**

```bash
git add docs/qa/mobile-shell-checklist.md frontend/src
git commit -m "test: verify mobile shell across target viewports"
```

---

## Phase 1 Acceptance Criteria

- Mobile shows the Natural City top bar, four-destination bottom navigation, and independent coral check-in action.
- The old mobile hamburger menu and black floating islands are absent from the core mobile path.
- Map, check-in, timeline, messages/friends entry, profile, notifications, auth, and all secondary legacy panels remain functional.
- Desktop retains its existing controls and functionality.
- No backend contract or production data changes occur.
- Node 20 backend and frontend tests, frontend typecheck, and frontend production build pass.
- The shell meets 44px touch targets, safe-area handling, visible focus, and reduced-motion requirements.
- The implementation is ready for Phase 2: Map Home Redesign.
