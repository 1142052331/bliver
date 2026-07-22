# Spatial MapLibre Migration Plan

**Milestone:** 2 of the Spatial Cinema OS roadmap

**Goal:** Replace Leaflet with one production MapLibre runtime while preserving
the current map contract, providing an accessible non-WebGL path, and keeping
provider configuration deployable without committed secrets.

## 1. Provider and Security Boundary

- [x] Add `maplibre-gl` to `@bliver/web` and expose a small map-style config
  that defaults to `https://tiles.openfreemap.org/styles/positron` and accepts
  `VITE_MAP_STYLE_URL` at deployment time.
- [x] Keep keys and real deployment values out of source control; document the
  variable name only.
- [x] Update production CSP for the configured style, tile/image, worker, and
  blob requirements. Assert the policy and remove the OpenStreetMap raster
  allowance.

## 2. Direct Map Runtime and Data Parity

- [x] Replace `react-leaflet` components with a directly owned `maplibre-gl`
  instance in `MapCanvas`; import MapLibre CSS only with the lazy map route.
- [x] Preserve the `items`, `selectedId`, `onSelect`, `onViewportChange`, and
  `viewport` contract. Synchronize URL bounds without animation and report
  user-driven camera bounds on `moveend`.
- [x] Project authorized footprints into a GeoJSON source. Add clustered and
  unclustered layers, forest/sage default markers, a forest selected state with
  a non-color ring/scale cue, and stable feature IDs. Coral remains reserved for
  creation and publication. Cluster expansion and point selection must remain
  keyboard-reachable through the parallel semantic list.
- [x] Preserve search, locate, realtime invalidation, privacy preview, selected
  footprint URL state, and publish coordinates at the route boundary.
- [x] On teardown, remove map event handlers, observers, sources/layers owned by
  the component, and the MapLibre instance.

## 3. Semantic and Reduced Capability Paths

- [x] Always render one DOM list item for every canvas footprint using
  `map-footprint-list` and `map-footprint-item`; expose author/location context,
  selected state, and an explicit selection action without relying on color.
- [x] When reduced motion is requested, do not initialize WebGL. Render a static
  geographic summary (`map-static-fallback`) plus the fully functional semantic
  footprint list.
- [x] Catch WebGL/style initialization failure and use the same static path.
  Keep map-provider failure distinct from footprint API loading/error state.
- [x] Ensure empty data, long author names, keyboard focus, and screen-reader
  order remain valid at all six supported viewports.

## 4. Deterministic Verification

- [x] Unit-test construction, initial and changed bounds, GeoJSON updates,
  selection, `moveend` reporting, cleanup, semantic-list parity, reduced motion,
  and WebGL initialization failure with a mocked `maplibre-gl` runtime.
- [x] Replace the raster tile E2E fixture with an intercepted minimal MapLibre
  style and stable semantic selectors. Cover guest discovery, selection, URL
  bounds, search, locate denial, realtime invalidation, and publish handoff.
- [x] Run map-focused Vitest and Playwright suites, API security-policy tests,
  lint, typecheck, build, and the six-project browser matrix. Inspect desktop
  and mobile screenshots and confirm the map canvas contains non-background
  pixels when WebGL is enabled.

## 5. Leaflet Removal and Evidence

- [x] After parity checks pass, remove `leaflet`, `react-leaflet`,
  `@types/leaflet`, Leaflet CSS, mocks, selectors, and lockfile entries. Do not
  keep two production map engines or a feature flag between them.
- [x] Confirm the initial app shell does not preload MapLibre JS/CSS and record
  route bundle sizes, CSP/provider assumptions, fallback evidence, commands,
  results, and accepted SHA in
  `docs/qa/v2-spatial-maplibre-migration.md`.

## Exit Gate

Milestone 2 passes only when MapLibre has functional parity, attribution and
CSP are verified, every map footprint has a semantic DOM counterpart, reduced
motion and failed WebGL remain usable, Leaflet is absent from source and the
dependency graph, and the complete verification matrix is green.
