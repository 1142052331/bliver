# Visibility, Activity, and Privacy-Aware Check-in QA

Date: 2026-07-13  
Commit under test: `b873285` (`codex/map-home-redesign`)
Scope: Task 14 production-readiness evidence for Phases 3 and 5.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend test suite | PASS | `17` suites, `347` tests passed (`npm.cmd test -- --runInBand` in `backend`) |
| Frontend test suite | PASS | `38` files, `330` tests passed (`npm.cmd test -- --run` in `frontend`) |
| Frontend typecheck | PASS | `npm.cmd run typecheck` |
| Production build | PASS with existing Vite bundle warnings | `vite v8.0.11`; output generated in `frontend/dist`; warning: main JS chunk ~937 kB and browser-image-compression dynamic-import optimization |
| Whitespace check | PASS | `git diff --check` |
| Impeccable deterministic detector | PASS | `detect.mjs --json` returned `[]` for ActivityPage, CheckInModal, LocationPermissionNotice |

Existing Mongoose deprecation warnings (`findOneAndUpdate` `new` option) remain non-blocking and are unrelated to this task.

## Functional coverage

### Activity

- [x] Guest public activity and strict reverse-chronological rendering: `ActivityPage.test.jsx`
- [x] Authenticated smart scope and fixed region/country/global scope switching
- [x] No-location/permission-denied fallback and disabled geography controls
- [x] Loading skeleton state
- [x] Empty smart, country, and fixed-scope states with broadening action
- [x] Cached content retained while refresh fails, with retry action
- [x] Error state with no cache and retry-only recovery
- [x] Long text retained without truncation
- [x] Tall media uses lazy loading and hides failed image without collapsing text
- [x] Guest interaction/comment login gate and authenticated callbacks
- [x] Keyboard Escape closes scope sheet/comment UI where covered by component tests

### Check-in privacy and resilience

- [x] First-public and remembered audience/precision initialization
- [x] Explicit audience and independent `locationPrecision` request payload
- [x] Contextual precise-location consequence copy
- [x] Location permission denied warning and no repeated passive geolocation request
- [x] Form state retention across upload/create failures (message, mood, image, position, visibility, precision)
- [x] Escape keyboard interaction covered by `CheckInModal.test.jsx`

### Responsive/accessibility contracts

- [x] Component tests assert semantic labels and interaction paths for Activity scope and privacy controls.
- [x] Natural City token constraints remain covered by existing CSS/component implementation and test suite.
- [ ] In-app browser visual inspection at 360x800, 390x844, 430x932, and desktop: not executed in this worker because the browser-control surface was unavailable. No visual pass is claimed.

## Production preview smoke test

Started Vite preview on `127.0.0.1:4173`, verified HTTP `200` for `/`, then stopped the preview process. This confirms the built entrypoint is servable only; it does not replace multi-viewport browser inspection.

## Impeccable review

Setup context loaded from the repository `PRODUCT.md` and `DESIGN.md`; product register and detector references were read before review. The deterministic local detector reported no findings for:

- `frontend/src/components/activity/ActivityPage.jsx`
- `frontend/src/components/CheckInModal.jsx`
- `frontend/src/components/LocationPermissionNotice.jsx`

No P0/P1 acceptance gap was identified by automated evidence. Manual browser visual review remains an environmental limitation documented above.

## Release limitations and follow-up

- Do not push, deploy, or run the live geography backfill as part of this QA task.
- Before production release, perform the in-app browser viewport matrix and keyboard/focus pass, then rerun the automated gates after any UI fixes.
