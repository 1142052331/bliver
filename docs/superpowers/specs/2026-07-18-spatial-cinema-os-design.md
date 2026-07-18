# Bliver Spatial Cinema OS Design

Status: Approved in conversation on 2026-07-18  
Scope: V2 Web/PWA/Capacitor visual and interaction system  
Register: Product  

## 1. Objective

Transform the complete Bliver V2 interface into a coherent, commercial-quality
product while preserving the Natural City identity and existing domain/API
boundaries. The result should reach the presentation quality associated with
Apple product storytelling and Steam's large-screen focus clarity without
copying either company's visual language.

The map remains the product. Cinematic treatment is concentrated in map,
footprint, publishing-success, and memory transitions. Repeated operational
tasks such as messaging, filtering, authentication, settings, notifications,
and moderation remain fast and restrained.

## 2. Approved Product Decisions

- Cover the whole product, including map, activity, publishing, footprint
  detail, messages, profile/memories, authentication, notifications,
  moderation/admin, and all loading/empty/error/offline states.
- Preserve Natural City: forest green, coral creation action, map-first
  composition, warm social tone, and visible privacy.
- Use the selected `Spatial Cinema OS` direction.
- Support Simplified Chinese, English, and Japanese from the first release.
- Select the initial locale from system preferences, then persist the user's
  explicit selection.
- Use an Apple-like cinematic mode only for meaningful spatial transitions.
- Use a Steam-like focus system on wide screens without turning Bliver into a
  game interface.
- Keep backend authorization, privacy policies, API contracts, and domain
  modules unchanged unless an implementation detail exposes a concrete missing
  display field.

## 3. Industry Evidence

The design translates the following official practices into Bliver-specific
rules:

- [Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion):
  motion is purposeful, optional, brief, realistic, cancellable, and reduced
  for frequent interactions.
- [Apple Vision Pro](https://www.apple.com/apple-vision-pro/): full-size media,
  short copy, sticky scenes, and chaptered disclosure create presentation
  quality. The page currently uses many media scenes, but Bliver applies this
  pattern only to spatial stories and memories.
- [Steam Deck Software](https://www.steamdeck.com/en/software): large-screen
  layouts use strong focus, clear media hierarchy, and high legibility.
- [Steam Deck Recommendations](https://partner.steamgames.com/doc/steamdeck/recommendations):
  support mixed input, multiple aspect ratios, offline use, and device-specific
  graphics settings.
- [Mapbox scroll fly-to](https://docs.mapbox.com/mapbox-gl-js/example/scroll-fly-to/):
  story chapters can drive map camera state.
- [MapLibre with Three.js](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/):
  a custom Three.js layer can share the map camera and projection.

## 4. Design Thesis

Physical scene: a person opens Bliver outdoors or while commuting, often in
mixed light and with one hand, to understand what happened around them without
leaving the map. Later, at home on a larger screen, the same person explores
their history as a spatial archive.

The interface therefore uses a light Natural City base, map-led color, compact
controls, and high-contrast text. Spectacle comes from real location, time,
relationship, and media data rather than decorative particles.

### 4.1 Signature Element: Chrono Lens

Selecting a footprint opens a circular or softly masked media lens anchored to
the footprint's projected screen coordinate. It reveals media, time, place,
relationship, and a short content excerpt while keeping the map visible.

The lens can expand into footprint detail or collapse back into the same map
coordinate. Memories use the same transition in reverse: a timeline entry opens
onto its location. This is the single memorable visual mechanism across the
product.

### 4.2 Self-Critique and Revision

The initial Pocket Atlas concept risked becoming another media-card product and
could have weakened the map. The approved revision removes repeated decorative
cards and assigns cinematic media to one data-driven transition. Utility
surfaces remain quiet. This prevents the result from reading as a generic warm
editorial layout or an AI-generated field of floating glass panels.

## 5. Visual System

### 5.1 Core Palette

The committed brand colors remain authoritative:

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Forest | `--bliver-color-forest` | `#173B31` | navigation, focus, primary actions |
| Forest soft | `--bliver-color-forest-soft` | `#2D594D` | hover, selected secondary surfaces |
| Coral | `--bliver-color-coral` | `#C54B36` | publish/check-in and urgent attention only |
| Paper | `--bliver-color-paper` | `#FAF8F3` | non-map base surface |
| Ink | `--bliver-color-ink` | `#1E2925` | primary text |
| Sage | `--bliver-color-sage-soft` | `#E5EEE9` | secondary tool and state surfaces |

Semantic success, warning, danger, and info colors remain independent. Map
relationship/scope states always include a label, icon, ring, or pattern so
color is never the only signal.

Coral is the one bold product color. It is reserved for publish/check-in,
publish success, and critical attention. It is not decorative.

### 5.2 Typography

- Brand and rare memory titles: Newsreader, then Noto Serif SC/JP and Georgia.
- Product UI and body: Inter, then Noto Sans SC/JP and platform sans-serif.
- Buttons, labels, navigation, admin, messages, and data never use the display
  serif.
- Mobile body text is at least 15px. Compact utility text is at least 12px.
- Product hierarchy uses a tight 1.125 to 1.2 scale and weight/spacing contrast.
- No viewport-width font scaling. Responsive behavior changes structure, not
  type size continuously.

### 5.3 Shape and Elevation

- Controls: 6px radius.
- Product surfaces, sheets, and media frames: 8px radius.
- The Chrono Lens is the only deliberately circular large surface.
- Pills are limited to compact status, scope, and mode selectors.
- Elevation communicates temporary layers only: map controls, lens, sheet,
  navigation, modal, toast, and tooltip.
- A semantic z-index scale replaces arbitrary numeric stacking values.
- Glass blur is limited to map-overlaid controls where preserving geographic
  context is useful. Content pages use opaque surfaces.

## 6. Responsive Experience Architecture

### 6.1 Mobile

```text
+----------------------------------+
| Brand | current place | alerts   |
|                                  |
|          full map canvas         |
|       selected Chrono Lens       |
|                                  |
|                    [Publish +]   |
| Map | Activity | Messages | Me   |
+----------------------------------+
```

- Full-bleed map.
- Exactly four bottom destinations.
- Separate coral publish action.
- Selected footprint first opens a preview lens, then an expandable bottom
  sheet or full route.
- Bottom sheets respect safe areas and the software keyboard.

### 6.2 Tablet

- Map remains the main canvas.
- A selected lens or detail can dock to a side panel in landscape.
- Touch and keyboard navigation coexist.
- Content routes use a readable centered column or split view where comparison
  helps.

### 6.3 Desktop and Large Screen

- Map occupies the majority of the viewport.
- A right-side focus rail lists visible/recent moments without duplicating a
  generic social feed.
- Arrow keys move focus between stable destinations and visible footprint
  items; Enter opens; Escape returns to the previous spatial layer.
- Pointer and keyboard input can coexist without focus jumping.
- Controller/Gamepad API support is not included. Steam is a focus and
  large-screen reference, not a requirement to turn Bliver into a console app.

## 7. Product Surface Rules

| Surface | Spatial treatment | Operational treatment |
| --- | --- | --- |
| Map | Full map, markers, trails, Chrono Lens | search, scope, filter, locate |
| Publish | map point and visibility preview | form, media upload, precision controls |
| Footprint detail | lens expands into media stage | reactions, comments, report/block |
| Activity | restrained media rhythm, relationship labels | search, filters, chronological stream |
| Messages | optional place preview in conversation context | dense list, timeline, composer, unread |
| Me/Memories | personal map, time trail, media stage | map/timeline/photo/visitor views |
| Notifications | no 3D | grouped list, read state, actionable errors |
| Authentication | subtle map context only | direct form, recovery, session state |
| Admin | no cinematic motion | dense work surface, filters, audit clarity |
| Errors/Offline | preserved map/list context when possible | exact cause, retry or next action |

## 8. Frontend Architecture

### 8.1 Dependencies

Add proven libraries for the approved responsibilities:

- `maplibre-gl` for vector map rendering, camera, styles, clustering, and
  terrain-capable map state.
- `three` for the custom spatial effect layer only.
- `motion` for React DOM transitions, presence, and focus-preserving layout
  changes.
- `i18next` and `react-i18next` for three-language resources and formatting.
- `lucide-react` for consistent product icons.

Remove React Leaflet and Leaflet after the MapLibre replacement passes parity,
accessibility, browser, and performance gates. Do not maintain two production
map engines.

Development defaults to the OpenFreeMap Liberty style at
`https://tiles.openfreemap.org/styles/liberty`. Deployment may inject a
provider-controlled `VITE_MAP_STYLE_URL`. No provider key or real environment
value is committed. Release acceptance must verify tile terms, attribution,
availability, and CSP; a public no-SLA endpoint is not accepted as the sole
production map dependency without a documented outage fallback.

### 8.2 Components

- `AppShell`: four destinations, publish entry, locale, notification access,
  and global feedback.
- `SpatialMapRuntime`: MapLibre lifecycle, viewport, camera, clusters, and map
  style.
- `SpatialEffectLayer`: Three.js footprint beacons, time trails, depth, and
  publish pulse.
- `ChronoLens`: projected media preview and map-to-detail transition.
- `FocusRail`: wide-screen footprint navigation; becomes a sheet on mobile.
- `MediaStage`: full media view for footprint and memory routes.
- `MotionController`: capability tier, reduced motion, durations, cancellation,
  and scene cleanup.
- `LocaleProvider`: initial system locale, persisted preference, resources,
  and document language.
- `@bliver/ui`: icon buttons, segmented controls, inputs, sheets, list rows,
  skeletons, empty/error states, admin primitives, tooltip, toast, and focus
  helpers.

### 8.3 Data and State Flow

```text
REST / Socket.IO
  -> TanStack Query cache
  -> authorized footprint projection
  -> MapLibre source and visible feature set
  -> Three.js visual projection (read only)
  -> URL selected footprint
  -> Chrono Lens
  -> detail route or memory scene
```

- TanStack Query owns server state.
- URL state owns selected footprint, map scope, filters, open surface, and
  shareable location.
- React local state owns transient form/focus interaction.
- Three.js never owns business state and never makes authorization decisions.
- Socket events update or invalidate query state; the render layers consume the
  resulting projection.
- Existing API and privacy policy remain authoritative.

## 9. Internationalization

Supported locale identifiers are `zh-CN`, `en`, and `ja`.

Initial resolution order:

1. persisted `bliver.locale` preference;
2. `navigator.languages` first matching `zh-*`, `ja-*`, or English;
3. English fallback.

Resource namespaces are `common`, `map`, `activity`, `footprints`, `messages`,
`memories`, `auth`, `notifications`, `admin`, and `errors`.

- Components contain no user-facing hardcoded strings.
- Dates, relative time, counts, and lists use `Intl` with the selected locale.
- `document.documentElement.lang` updates with the selected locale.
- English and Japanese long labels define control width stress cases.
- Chinese/Japanese line-breaking and punctuation are checked on every core
  route.
- Missing keys fail tests; production falls back to English without exposing a
  raw key.

## 10. Motion and Capability Tiers

### 10.1 Spatial

Enabled when WebGL and device/runtime checks pass and reduced motion is off.
Includes terrain/depth, time trails, Chrono Lens camera anchoring, publish
pulse, and cinematic memory transitions.

### 10.2 Standard

MapLibre remains interactive, while expensive Three.js effects, terrain, and
continuous camera motion are disabled. Chrono Lens uses a DOM/CSS transition.

### 10.3 Reduced

Used for reduced motion, WebGL initialization failure, or explicit low-effect
preference. Shows a static geographic summary plus the semantic footprint list.
Publishing, reading, privacy, messages, and navigation remain complete.

Operational transitions last 150 to 250ms. A meaningful map-to-media transition
may last up to 650ms, remains cancellable, and never blocks navigation. No
content starts hidden waiting for animation.

## 11. Error, Empty, Loading, and Offline States

- Tile/style failure is separate from footprint-data failure.
- Location permission denial explains how to continue without location.
- Offline map state never implies private data was cached when it was not.
- Media failure preserves text, place, author, privacy, and interactions.
- Three.js failure lowers the capability tier and records telemetry without
  breaking the route.
- Authentication expiry stores the exact pending reaction, comment, report,
  publish, or message action and restores it after sign-in.
- Structured content uses skeletons. Empty states offer the next useful action.
- Errors state what failed and provide a retry or alternate path.
- Admin errors preserve filters and work context.

## 12. Accessibility and Input

- Target WCAG 2.2 AA contrast.
- All interactive targets are at least 44 by 44 CSS pixels.
- Every canvas footprint also exists in a semantic DOM list.
- Focus order follows visual order and returns to the invoking control when a
  sheet/lens closes.
- Desktop arrow-key focus is explicit and does not replace normal Tab order.
- Privacy, relationship, scope, status, and error never rely on color alone.
- All icon-only controls have accessible names and tooltips where meaning is not
  familiar.
- Motion never communicates the only state change.
- Touch, pointer, keyboard, software keyboard, safe areas, and screen readers
  are first-class acceptance paths.

## 13. Performance Budgets

- MapLibre and Three.js load only on spatial routes.
- Non-spatial routes do not import map or Three.js modules.
- Initial shell JavaScript target: at most 160KB gzip.
- Spatial runtime chunk target: at most 500KB gzip, measured separately.
- LCP target: at most 2.5s in the release test profile.
- INP target: at most 200ms.
- Map interaction target: at least 45fps on the mobile performance profile and
  at least 55fps on the desktop performance profile.
- Sustained route changes must not show monotonically increasing renderer,
  texture, listener, or WebGL context counts.
- MapLibre instances, Three.js renderer, geometries, materials, textures, and
  listeners are disposed on route teardown.

Exceeding a budget blocks the release or requires a written, dated exception.

The automated mobile performance profile is Chromium at 390x844, 4x CPU
slowdown, 1.6Mbps download, 750Kbps upload, and 150ms round-trip latency. The
desktop profile is Chromium at 1440x1000 with no CPU or network throttling on
the release runner. Real-device acceptance additionally uses one Android phone
from the Pixel 6a performance class or lower; its model, OS, browser/WebView,
thermal state, and power mode are recorded with the evidence.

## 14. Verification

### 14.1 Automated

- Unit tests: locale resolution, translation completeness, capability tiers,
  motion cancellation, coordinate projection, URL state, and cleanup.
- Component tests: every surface and loading/empty/error/offline state.
- Playwright viewports: 360x800, 390x844, 430x932, 1024x768, 1440x1000,
  and 1920x1080.
- Core journeys run in Simplified Chinese, English, and Japanese.
- Input coverage: touch-equivalent, pointer, Tab, arrow focus, Enter, Escape,
  and software-keyboard layouts.
- Accessibility: axe, semantic footprint list, focus restoration, and contrast.
- Visual regression: shell, map, lens, detail, activity, messages, memories,
  auth, notifications, admin, and state surfaces.
- WebGL screenshots and canvas-pixel checks prove scenes are nonblank, correctly
  framed, and layered without overlap.
- Reduced-motion, Standard, Reduced, tile failure, WebGL failure, and offline
  paths are tested.

### 14.2 Manual

- Real iOS/Android browser or Capacitor checks at phone sizes.
- Desktop and wide-screen checks at normal viewing distance.
- Long Chinese, English, and Japanese strings.
- Bright outdoor and dark indoor readability.
- Rapid selection, cancellation, back navigation, and route switching.
- At least a 20-minute map/message/memory session to inspect heat, battery,
  dropped frames, and memory behavior.

## 15. Implementation Sequence

The design is one system, implemented in independently verifiable milestones:

1. Design tokens, primitives, app shell, icons, and three-language foundation.
2. MapLibre parity replacement and semantic map list.
3. Three.js spatial layer, capability tiers, and cleanup.
4. Chrono Lens, footprint detail, publishing, and memory transitions.
5. Activity, messages, profile/memories, and notification convergence.
6. Authentication, admin, and complete state-system convergence.
7. Cross-device visual regression, accessibility, performance, and release
   evidence.

Each milestone preserves a runnable product and passes focused tests before the
next begins.

## 16. Non-Goals

- Backend domain redesign.
- Changes to visibility or privacy semantics.
- A marketing landing page.
- Decorative 3D on messages, settings, auth, notifications, or admin.
- Gamepad support.
- Maintaining Leaflet and MapLibre as two production engines.
- Replacing real user/map media with decorative generated illustrations.

## 17. Acceptance Summary

The design passes when Bliver opens as a living spatial product, the Chrono
Lens creates one memorable spatial-media transition, all operational surfaces
share a precise product vocabulary, all three locales complete core journeys,
and high-end effects degrade without losing any feature, privacy guarantee, or
accessible path.
