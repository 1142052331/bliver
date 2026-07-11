# Phase 2 Map Home Completion QA

Date: 2026-07-11
Branch: `codex/map-home-redesign`
Target: `frontend/src/App.jsx`

## Automated Gate

- Frontend tests: 30 files, 227 tests passed before visual corrections.
- Backend tests: 6 suites, 74 tests passed.
- Frontend typecheck passed.
- Production build passed after replacing an unsupported `MapOff` Lucide export with `MapPinOff`.
- `git diff --check` passed.
- Existing non-blocking build warnings remain for the 500 kB chunk threshold and the mixed static/dynamic `browser-image-compression` import.

## Browser Evidence

Production preview: `http://127.0.0.1:4173/`

Inspected viewports:

- 360x800: filter sheet, guest unread explanation, bottom-navigation clearance.
- 390x844: default map, loading and data-failure notices, touch-target measurement.
- 430x932: scope sheet and search failure state.
- 1440x1000: desktop map, legacy navigation, and desktop shortcuts.

Environment limitation:

- The preview backend was unavailable, so authorized footprints, same-place data, photo preview, and long-content preview could not be produced from real API data. Their component behavior remains covered by automated tests.
- The Browser interface exposed read-only page evaluation, so the Impeccable visualization script could not be reliably injected. No user-visible overlay is claimed.

## Assessment A: Design Review

### Design Health

| Heuristic | Score | Evidence |
| --- | ---: | --- |
| Visibility of system status | 3/4 | Loading, data failure, search failure, offline, and tile failure are separated. Initial count and loading can appear together briefly. |
| Match with the real world | 4/4 | Smart, province, country, global, relationship, time, and content language matches user concepts. |
| User control and freedom | 4/4 | Sheets close explicitly, reset/apply actions are clear, and map context remains visible. |
| Consistency and standards | 2/4 | Mobile uses Natural City, while desktop still uses legacy black glass and neon treatments. |
| Error prevention | 3/4 | Guest unread is disabled with an explanation; fixed scopes require location context. |
| Recognition over recall | 4/4 | Icons include text labels and selected states are explicit. |
| Flexibility and efficiency | 3/4 | Search is keyboard navigable and filters are URL-restorable; no dedicated desktop search shortcut. |
| Aesthetic and minimalist design | 3/4 | Mobile is restrained and map-first; desktop legacy chrome competes with the map. |
| Error recovery | 4/4 | Data and tile failures have separate retry actions without replacing the map. |
| Help and documentation | 2/4 | Contextual permission and guest-filter guidance exists, but broader help is outside the map surface. |
| **Total** | **32/40** | **Good; targeted corrections required before release.** |

### Anti-Patterns Verdict

- Mobile does not read as generic AI UI. The map remains dominant, the forest/sage/coral hierarchy is restrained, and the footprint pulse is the one branded motion.
- Desktop is inconsistent with the approved system because `ios-glass` and `aurora-btn-glass` recreate the explicitly rejected black-glass aesthetic.
- No decorative gradient text, nested card grid, side-stripe card, or looping marker animation was observed on the new map surface.

### Cognitive Load and Emotional Journey

- Default mobile exposes search, scope, filter, locate, reset, publish, and four destinations without turning the map into a toolbar.
- The filter sheet presents eleven choices, but grouping into relationship, time, and content keeps each decision bounded.
- Failure states preserve geographic context and offer recovery, preventing an emotional dead end.
- A first-time guest can understand why unread filtering is unavailable without guessing about authentication.

### Persona Red Flags

- Distracted mobile user: the data retry action measures 36px high, below the 44px project minimum.
- Accessibility-dependent user: touch targets generally pass, but the retry action does not; the duplicate native and custom search clear controls create redundant affordances.
- Returning desktop user: the old black glass header and shortcuts make the same product look like a different design system.

## Assessment B: Detector and Browser Measurements

- Deterministic detector: one `overused-font` warning at `frontend/src/styles/tokens.css:33` for Inter.
- The font warning is an accepted false positive because `DESIGN.md` explicitly specifies Inter for product controls and content; product-register guidance allows a familiar sans system.
- At 390x844, visible search, scope, filter, locate, reset, publish, top-bar, and navigation controls measured at least 44px.
- The visible data retry button measured 36px high.
- The desktop navigation computed background is a translucent black gradient; desktop shortcut buttons use `blur(30px)` and measure 41px high.
- A filled search input shows both the browser-native search cancellation control and the custom `清除搜索` button.

## Priority Corrections

- [P1] Replace desktop black-glass navigation and shortcut styling with the shared Natural City surface and button vocabulary.
- [P2] Hide the native search cancellation control so only the accessible custom clear button remains.
- [P2] Raise map notice action buttons to a 44px minimum target.

## Accepted Strengths

- Mobile information hierarchy preserves most of the map canvas at all inspected sizes.
- Coral remains reserved for publish and urgent attention.
- Scope and filter sheets use one major surface at a time and avoid the bottom navigation.
- Search, scope, filter, tile, data, loading, and guest-auth states use explicit text rather than color alone.
- Reduced-motion CSS disables pulse and spinner animation.

## Reinspection

The three priority corrections were rechecked against a fresh production build:

- 390x844: the filled search field exposes one custom clear button; its rendered target is 44x44px and the native WebKit cancel control is hidden by the shipped stylesheet.
- 390x844: the visible `重试足迹` action renders at 44px high.
- 360x800: the filter sheet stays within the viewport with no horizontal overflow and preserves bottom-navigation clearance.
- 430x932: the scope sheet stays within the viewport, has no horizontal overflow, and contains no button smaller than 44px in either dimension.
- Desktop default viewport (1280x720): navigation uses the Natural City paper surface, shortcuts use white surfaces, `backdrop-filter` computes to `none`, navigation is 64px high, and shortcuts are 44px high.
- Updated Nielsen score: 35/40. Consistency and aesthetic-minimalism each improve from 2/4 and 3/4 to 4/4; no P0 or P1 issue remains on the inspected map-home surface.

The deterministic detector still reports only the accepted Inter warning. Real authorized data states remain subject to the backend-unavailable limitation documented above.
