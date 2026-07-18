# V2 Spatial MapLibre Migration Acceptance

**Accepted implementation SHA:** `a871d0a8a8752b0c43922baf08b6d70073aa2c26`

**Acceptance date:** 2026-07-19 (Asia/Tokyo)

## Outcome

Milestone 2 is accepted. MapLibre GL 5.24.0 is the only production map engine.
The map remains the primary product surface, authorized footprints are rendered
from a clustered GeoJSON source, and every canvas footprint has an actionable
semantic DOM counterpart.

The accepted visual contract is Natural City x Spatial Cinema OS:

- Forest indicates structure and selection.
- Selected markers also use a white ring and scale change, so state is not
  communicated by color alone.
- Coral remains reserved for check-in, creation, publication, and urgent
  attention.
- Chinese, English, and Japanese controls use the same map runtime.

## Runtime Contract

- `MapCanvas` directly owns MapLibre construction, controls, source/layers,
  handlers, `ResizeObserver`, camera synchronization, and teardown.
- `renderWorldCopies: false` provides a single-world camera. Reported bounds are
  clamped to `[-180, 180]` longitude and Web Mercator latitude limits before
  reaching the URL or discovery API.
- Full-world `maxBounds` is intentionally not passed. In MapLibre 5.24.0,
  exact `[-180, 180]` bounds wrap to a degenerate interval during construction
  and can fail before projection matrices are ready.
- Initial URL bounds are applied by the constructor and are not immediately
  repeated with `fitBounds`, preventing first-interaction camera races.
- Search, locate, footprint selection/deep links, Socket.IO invalidation,
  privacy preview, attribution, and map-to-publish coordinates are preserved.
- Cross-date-line backend queries remain out of scope; the UI exposes one
  clamped world rather than issuing split queries.

## Provider And Security

- Development defaults to the structured OpenFreeMap Liberty provider with
  OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution links.
- Routine production requires a root-relative same-origin style URL plus
  structured attribution JSON. OpenFreeMap release use requires explicit
  emergency approval that expires within seven days.
- Production CSP tests cover the exact MapLibre worker/blob and configured
  image/style sources, including Cloudinary media requirements.
- No provider key or real deployment value is committed. Deployment variables
  are names and validation contracts only.

## Reduced Capability And Failure Paths

- Reduced motion avoids WebGL initialization and retains the geographic summary
  and full semantic footprint list.
- Provider validation failure, WebGL construction failure, style initialization
  failure, repeated resource errors, offline footprint loading, and API errors
  have distinct tested paths.
- Static fallback items remain keyboard-operable and preserve footprint URL
  selection.

## Verification Matrix

| Gate | Result |
| --- | --- |
| `npm.cmd run verify:v2-foundation` | PASS: 469 tests, 2 skipped; 789 modules and 791 dependencies with no architecture violation; all lint, typecheck, API/web builds passed |
| `npx.cmd playwright test apps/web/e2e/auth.spec.ts apps/web/e2e/map-footprints.spec.ts` | PASS: 126/126 across 360x800, 390x844, 430x932, 1024x768, 1440x1000, and 1920x1080 |
| MapLibre focused unit suite | PASS: 16/16, including constructor, dynamic GeoJSON `setData`, bounds, selection, teardown, observer disconnect, reduced motion, and failure recovery |
| Camera and search-to-publish repeat check | PASS: 10/10 over five consecutive desktop repetitions |
| `npm.cmd run perf:v2:browser-evidence` | PASS: realtime/outbox 6/6 and keyboard focus 6/6; worst reconnect 45.4 ms; worst INP 24 ms |
| `npm.cmd run perf:v2` | PASS in local non-release mode; zero synthetic API errors |
| Leaflet source/dependency/dist audit | PASS: no runtime source, package manifest, lockfile, installed dependency, filename, or built-content match |

`test-results/.last-run.json` records `passed` with no failed tests. Browser
performance evidence run `22bf9604-ce5e-4979-944f-4837043d8d14` is stored under
`.artifacts/browser-performance/evidence`.

## Bundle Evidence

- Initial shell JavaScript closure: `122,463 B` gzip (budget `160,000 B`).
- Spatial runtime increment: `359,335 B` gzip (budget `500,000 B`).
- Map route JavaScript entry: `277,419 B` gzip.
- Map CSS: approximately `12.25 kB` gzip.
- Vite manifest initial imports contain only the JSX runtime and query client
  provider. The map route and MapLibre CSS remain dynamic imports and are not
  preloaded by the initial shell.

## Manual Browser Inspection

The live V2 map was inspected with the in-app browser against local PostgreSQL:

- `390x844`: interactive mode, one MapLibre canvas, zero horizontal overflow;
  controls, semantic list, preview, and bottom navigation remained separated.
- `1440x1000`: interactive mode, one MapLibre canvas, zero horizontal overflow;
  controls, attribution, semantic list, and preview had no pairwise overlap.
- Both views retained readable real map labels, the forest selected marker, and
  the coral publish action while keeping the map visually dominant.

## Evidence Limits

This acceptance is for the spatial migration and local candidate gates. Local
non-release performance mode skipped live PostGIS `EXPLAIN` because no release
database URL was injected, and skipped Lighthouse LCP/CLS because no release
report was supplied. Production cutover still requires those release-mode
artifacts and the separate production observation/sign-off process.

Vite may log `ECONNABORTED` when isolated Playwright browser contexts close
their Socket.IO connections. All recorded occurrences happened during teardown
and did not fail the browser gates.
