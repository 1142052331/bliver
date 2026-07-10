# Mobile Shell QA

## Viewports
- [x] 360×800 small Android
- [x] 390×844 canonical phone
- [x] 430×932 large phone
- [x] 1440×1000 desktop compatibility

## Guest
- [x] Map loads and remains pannable outside controls.
- [x] Bottom navigation has exactly Map, Activity, Messages, Me.
- [x] Check-in requests login and does not open an unauthenticated form.
- [x] Messages and Me request login with actionable copy.
- [x] Activity opens the existing TimelineDrawer.
- [x] No hamburger menu appears on mobile.

## Authenticated
- [ ] Check-in opens the existing CheckInModal.
- [ ] Activity opens the existing TimelineDrawer.
- [ ] Messages opens the existing friends/message entry.
- [ ] Me opens the current user's profile.
- [ ] Notification badge and message badge remain accurate.

Authenticated checks require a disposable non-production account and were not performed during the read-only guest regression.

## Desktop Compatibility
- [x] Mobile shell controls are hidden at 1440×1000.
- [x] The existing desktop NavBar remains visible.
- [x] Existing desktop timeline and photo-wall controls remain visible.

## Accessibility
- [x] Every visible `[data-shell-control]` is at least 44×44 CSS pixels.
- [x] Keyboard focus styling remains defined for shell controls.
- [x] Screen-reader names are meaningful.
- [x] Reduced motion removes transform animation.
- [x] Bottom navigation clears the home indicator safe area.

## Geometry and Runtime Results

| Viewport | Visible shell controls | Minimum control | Horizontal overflow | Map drag | Console/page errors |
| --- | ---: | ---: | ---: | --- | ---: |
| 360×800 | 7 | 44×44 | 0 px | Passed | 0 |
| 390×844 | 7 | 44×44 | 0 px | Passed | 0 |
| 430×932 | 7 | 44×44 | 0 px | Passed | 0 |
| 1440×1000 | 0 mobile controls | n/a | 0 px | Not required | 0 |

- Leaflet attribution initially overlapped the mobile bottom navigation at all three phone viewports.
- The regression assertion was added before the fix, and the mobile attribution now keeps a visible 8px gap above the navigation.
- Switching destinations first closes the currently open destination-owned legacy interface; closing the selected destination interface returns the selection to Map.

## Current Commands

Use the repository portable Node.js 20 runtime in PowerShell:

```powershell
$env:PATH='E:\bliver-worktrees\.runtime\node20;' + $env:PATH
npm.cmd run check:node
npm.cmd run build --prefix frontend
npm.cmd run preview --prefix frontend -- --host 127.0.0.1 --port 4173
```

If the requested preview port is occupied, use the next port reported by Vite. The Task 8 run requested `4173` and Vite selected `4174`.

Browser regression uses the system Chrome executable and the Playwright package bundled with Codex:

```text
Chrome: C:\Program Files\Google\Chrome\Application\chrome.exe
Playwright: C:\Users\Administrator\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_modules\playwright
```

Temporary scripts, JSON reports, logs, and screenshots are stored under `.local-runtime/` and must not be committed.

## Complete Verification

```powershell
$env:PATH='E:\bliver-worktrees\.runtime\node20;' + $env:PATH
npm.cmd run check:node
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
git status --short
```
