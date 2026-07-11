---
target: frontend/src/App.jsx
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-07-11T08-59-34Z
slug: frontend-src-app-jsx
---
# Map Home Design Critique

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | ---: | --- |
| 1 | Visibility of system status | 3/4 | Loading and footprint count may overlap briefly during initial startup. |
| 2 | Match system and real world | 4/4 | Scope, relationship, time, and location language follows user concepts. |
| 3 | User control and freedom | 4/4 | Sheets close explicitly, filters reset cleanly, and map context remains visible. |
| 4 | Consistency and standards | 4/4 | Mobile and desktop now share the Natural City surface and control vocabulary. |
| 5 | Error prevention | 3/4 | Guest unread filtering and location-dependent scopes are guarded with explanations. |
| 6 | Recognition over recall | 4/4 | Controls combine icons, labels, and explicit selected states. |
| 7 | Flexibility and efficiency | 3/4 | Search and filters are keyboard and URL friendly; no dedicated desktop shortcut is provided. |
| 8 | Aesthetic and minimalist design | 4/4 | The map remains dominant, coral is reserved, and legacy black glass is removed from desktop map chrome. |
| 9 | Error recovery | 4/4 | Tile, footprint, and search failures are distinct and actionable without replacing the map. |
| 10 | Help and documentation | 2/4 | Contextual permission and guest guidance exists; broader product help is outside this surface. |
| | **Total** | **35/40** | **Release-ready for the inspected states.** |

## Anti-Patterns Verdict

The map home does not read as generic AI UI. The living map remains the visual subject, forest and sage carry navigation and selection, and coral is limited to publishing and urgent attention. Desktop now matches the approved Natural City system instead of recreating black glass. No gradient text, decorative glass blur, nested card grid, side-stripe callout, or looping marker animation was observed.

The deterministic detector reports one `overused-font` warning for Inter at `frontend/src/styles/tokens.css:33`. This is an accepted false positive because the committed design specification assigns Inter to product controls and content, and the product register explicitly permits a familiar sans system.

## Priority Issues

- P0: none.
- P1: none.
- P2: initial loading and zero-count status can overlap briefly; consider consolidating the first-load status in a later polish pass.
- P3: a dedicated desktop search shortcut could improve repeat-user efficiency, but the visible search field remains immediately accessible.

## Persona Red Flags

- Distracted mobile user: no release-blocking issue remains; visible recovery and clear controls meet the 44px touch minimum.
- Accessibility-dependent user: the duplicate search clear affordance is removed, mobile sheets show no undersized buttons in the inspected states, and errors include text rather than relying on color.
- Returning desktop user: the navigation and shortcuts now use the same light Natural City system as mobile.

## Minor Observations

- Production build still warns about a large JavaScript chunk and mixed static/dynamic image-compression imports; these are performance follow-ups rather than visual blockers.
- The preview backend was unavailable, so authorized footprints, same-place data, photo preview, and long-content preview could not be produced from real API data. Automated component tests cover those behaviors.
- No user-visible detector overlay is claimed because browser script injection was not reliably available.

## Reinspection Evidence

- At 390x844, one custom search clear control renders at 44x44px, the stylesheet hides the WebKit native cancel control, and `重试足迹` renders at 44px high.
- At 360x800, the filter sheet fits without horizontal overflow and clears bottom navigation.
- At 430x932, the scope sheet fits without horizontal overflow and contains no button below 44px in width or height.
- At the default desktop viewport of 1280x720, navigation uses the paper surface, shortcuts use white surfaces, all inspected backdrop filters compute to `none`, navigation is 64px high, and shortcuts are 44px high.
