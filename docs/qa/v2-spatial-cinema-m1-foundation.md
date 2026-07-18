# Spatial Cinema Milestone 1: Foundation Evidence

Date: 2026-07-18  
Scope: Natural City primitives, trilingual runtime, responsive shell, global states, and route-level loading  
Status: PASS

- V2 lint: PASS, zero warnings across all workspaces.
- V2 typecheck: PASS across all workspaces and release scripts.
- V2 Vitest: PASS, 421 passed, 2 skipped, zero failed.
- API/Web production build: PASS.
- Shell and accessibility Playwright: PASS, 54 passed across six viewport projects.
- Authenticated and guest route Playwright: PASS, 36 passed across six viewport projects.
- Simplified Chinese, English, and Japanese shell journeys: PASS, 18 locale journeys.
- Touch targets, horizontal overflow, Japanese label layout, keyboard order, reduced motion, and WCAG axe checks: PASS.
- Initial shell JavaScript: 113.38 KB gzip, below the 160 KB budget.
- Spatial map route JavaScript: 47.52 KB gzip and absent from non-spatial HTML preloads.
- In-app browser visual review: PASS at the mobile shell breakpoint; no console warnings or errors. The overlapping legacy map title was removed from the visual layer while preserving its semantic heading.
- `git diff --check`: PASS.

No map engine, backend contract, privacy policy, database, production environment,
or real secret changed in this milestone. Existing Leaflet remains isolated to the
spatial route until the separately planned MapLibre migration.
