# Phase 4 Footprint Detail and Public Conversation QA

Date: 2026-07-13

## Automated Gate

- Backend: `npm.cmd test --prefix backend` - 20 suites, 357 tests passed.
- Frontend: `npm.cmd test --prefix frontend` - 44 files, 345 tests passed.
- Frontend typecheck: `npm.cmd run typecheck --prefix frontend` - passed.
- Frontend build: `npm.cmd run build --prefix frontend` - passed.
- Diff hygiene: `git diff --check` - passed.

The build retains the existing non-blocking chunk-size and ineffective dynamic-import warnings.

## Impeccable and Frontend Design Review

- Information hierarchy: author/relationship, place/time, content, reactions, comments, and composer remain in that order; the map remains visible behind the default 72dvh sheet.
- Natural City signature: forest-green detail header and selected-map relationship, paper/surface layers, sage support, and coral reserved for urgent/publish roles.
- Control vocabulary: 44px close, expand, More, reaction, reply, composer, and retry targets; More menus expose only authorized report/delete actions.
- Contrast and type: forest ink on paper/surface; body copy remains 15px; brand serif is not used in dense controls.
- Safe areas and long text: bottom padding includes `env(safe-area-inset-bottom)`; long place names wrap without horizontal overflow.
- Motion: sheet snap is stable and does not animate layout dimensions; reduced-motion removes remaining transitions.
- Detector: initial warning was the generic Inter fallback; core token now uses the Noto Sans/system stack. Final detector on changed detail files returned no findings.
- Prohibited patterns checked: no glass panels, neon gradients, looping decoration, nested cards, side-stripe accents, or arbitrary z-index layers in the new detail/conversation UI.

## Browser Acceptance

Preview: `http://127.0.0.1:4173/` was reachable from the in-app browser. The actual home view showed the map and empty guest state because no backend data was available.

A temporary Vite harness rendered the production `FootprintDetailModal`, `FootprintDetailSheet`, conversation, moderation menu, tokens, and action context without connecting to a database. Screenshots were captured and inspected at:

- 360x800: default sheet, 576px high, no horizontal overflow.
- 390x844: default sheet and expanded sheet, long place name wraps, comments remain readable.
- 430x932: default sheet, 671px high, no horizontal overflow.
- 1440x1000: centered narrow desktop panel, map context remains visible.

The harness also verified the More menu exposes `举报足迹` for a stranger viewer and the DOM contains the two-level comment order plus composer. Temporary harness files were removed after inspection.

## Accepted Limitations

- Browser acceptance used deterministic local fixture data for the detail sheet; no real database or geographic backfill was executed.
- Real authenticated report submission, administrator deletion, and Socket.IO mutation delivery remain covered by automated tests rather than a live production session.
- No push, deploy, or external data mutation was performed.
