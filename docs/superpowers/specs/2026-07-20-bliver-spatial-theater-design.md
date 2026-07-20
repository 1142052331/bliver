# Bliver Spatial Theater Product Design

Status: Approved in conversation on 2026-07-20; written-spec review pending
Scope: Complete V2 Web/PWA frontend visual and interaction convergence
Canonical viewport: 390x844 CSS pixels
Register: Product

## 1. Purpose

Bring the complete Bliver V2 frontend to a coherent commercial-product level
without changing backend domains, authorization, privacy semantics, API
contracts, PostgreSQL ownership, or the existing MapLibre migration.

The selected direction is **Spatial Theater**:

- the map or authorized footprint media is the visual protagonist;
- one human moment owns the active stage;
- interface controls form a quiet caption and action track;
- forest green and the coral publish action remain Bliver's identity;
- cinematic motion is concentrated in spatial focus, publishing, and deliberate
  story transitions;
- repeated work stays fast, familiar, and restrained.

The goal is the presentation discipline of Apple's product experiences and the
focus clarity of Steam's large-screen interfaces, adapted to a mobile-first
location social product rather than copied as a visual skin.

## 2. Relationship To Prior Design Work

This document supersedes the visual composition, component, dependency, motion,
responsive, and acceptance decisions in
`2026-07-18-spatial-cinema-os-design.md` wherever the two conflict.

The following prior decisions remain valid:

- MapLibre is the sole production map runtime.
- Simplified Chinese, English, and Japanese ship together.
- Initial locale follows the system; an explicit choice is persisted.
- the Natural City palette and privacy-visible product principles remain
  authoritative;
- all domain modules, API authorization, discovery rules, and data ownership
  stay unchanged.

The following decisions are replaced:

- GSAP and `@gsap/react`, already present in the application, own advanced DOM
  motion. Do not add the `motion` library.
- Three.js is not part of this convergence phase. The approved result derives
  spectacle from the real map, real media, spatial camera state, and shared
  elements. A future Three.js proposal requires a separate measurable product
  need, performance budget, and design approval.
- `ChronoLens` remains an implementation name for map selection and the shared
  anchor, but a large circular lens is not a required visual shape.
- the signature system is the shared moment anchor across map, preview, detail,
  Activity, publish confirmation, and Memories.

## 3. Approved Product Decisions

- Apply one system to authentication, map, Activity, publishing, footprint
  detail, messages, social/people, profile and Memories, notifications,
  moderation/admin, and every loading, empty, offline, and error state.
- Preserve forest green, the coral creation action, the map-first identity, and
  the four-destination mobile Dock.
- Treat 390x844 as the canonical canvas. Desktop adapts the mobile information
  architecture instead of defining it.
- Use three scene contracts: Spatial, Story, and Work.
- Use GSAP for cinematic entry, spatial/shared-element transitions, deliberate
  story sequencing, and coordinated state changes.
- Keep CSS responsible for layout, static material, responsive geometry,
  hover/focus, skeletons, and the final reduced-motion state.
- Do not recreate a generic social card feed, a decorative glass dashboard, a
  dark radar interface, or a marketing-style hero inside the product.

## 4. Core Visual Grammar

### 4.1 Moment First

A footprint is a human moment before it is a coordinate. Authorized media is
the primary visual material when present. The map is the fallback scene and the
continuous source of place context.

### 4.2 One Active Plane

Every route uses at most one active work surface over or beside its stage. Do
not nest cards, stack translucent panels, or place multiple equal-weight
surfaces over the map.

The shared vertical order is:

1. scene or place context;
2. caption rail: identity, relationship, place, time, privacy;
3. current content and media;
4. current action rail;
5. Dock or route navigation.

### 4.3 Three Scene Contracts

| Contract | Primary routes | Rule |
| --- | --- | --- |
| Spatial | Map, map selection, location picking | The map owns the canvas; detail rises from it. |
| Story | Activity, footprint detail, publish success, Memories | One moment owns the stage; adjacent moments support it. |
| Work | Auth, messages, notifications, people, settings, admin | Task continuity and information density beat cinematic decoration. |

A route may not borrow another contract's transition language without a user
reason. Notifications and admin do not receive cinematic page entrances.

### 4.4 Shared Anchor

The selected marker, preview media, detail media, Activity media, publishing
confirmation, and memory item share one visual anchor when they represent the
same footprint.

The anchor arrives first. Caption and controls follow. Never non-uniformly
stretch an entire card to simulate a shared-element transition.

### 4.5 One Bold Thing

Coral is reserved for check-in/publish, publish success, destructive attention,
and the selected spatial anchor when required. It is not a decorative accent
applied to headings, borders, and inactive controls.

### 4.6 Content Test

If decorative axes, reticles, coordinates, and motion are hidden, a screenshot
must still be recognizable as Bliver through its real map or moment media,
place hierarchy, privacy state, shared moment structure, and coral publish
action. Decoration cannot carry the product identity by itself.

## 5. Visual System

### 5.1 Authoritative Color Tokens

Use the existing Natural City tokens. Mockup-only near-duplicates must not be
added to production.

| Role | Value | Use |
| --- | --- | --- |
| Forest | `#173B31` | navigation, selection, primary product actions |
| Forest soft | `#2D594D` | hover and secondary selected states |
| Coral | `#C54B36` | publish/check-in and critical attention |
| Paper | `#FAF8F3` | non-map base material |
| Surface | `#FFFFFF` | forms, work surfaces, sheets |
| Ink | `#1E2925` | primary text |
| Muted ink | `#5D7068` | secondary text that still passes contrast |
| Border | `#D7E1DC` | structure and separation |

Semantic success, warning, danger, and information colors remain independent
and always have icon or text support.

### 5.2 Typography

- Product UI: Inter, Noto Sans SC, Noto Sans JP, then platform sans-serif.
- Wordmark and rare memory headings: Newsreader, then appropriate CJK serif
  fallback.
- Serif is prohibited in buttons, inputs, navigation, data, messages, and
  admin UI.
- Mobile body text is at least 15px; compact metadata is at least 12px.
- Product headings use a fixed, compact scale. Font size does not scale with
  viewport width.
- Letter spacing is zero for normal UI copy. Brand-specific exceptions remain
  confined to the wordmark and short metadata labels.

### 5.3 Shape, Material, And Elevation

- Cards and framed tools use 8px radius or less unless an existing sheet or
  phone-safe surface requires a larger established radius.
- Dock, sheets, controls, and media use one consistent radius family.
- Pills are limited to true status, scope, and segmented-mode controls.
- Opaque surfaces are the default. Blur is permitted only where geographic
  context must remain legible through a temporary map control.
- Elevation communicates temporary layers only.
- Map style, map canvas, media, matte, work surface, overlay, and scrim are
  named materials. Do not filter the entire map to create brand identity.

## 6. Component And Layout System

### 6.1 Existing Ownership

The implementation should converge on the current boundaries rather than
create a parallel design runtime:

- `SceneDirector`: short route arrival only; it does not own routing or page
  layout.
- `MomentFrame`: shared visual contract for media/place material.
- `ChronoLens`: map selection and shared-anchor source/target; its external
  shape follows the current scene rather than requiring a circle.
- `AppStatusScene`: global and route-level auth/error/offline states.
- `platform/motion`: GSAP registration, tokens, media queries, shared spatial
  transition helpers, and plugin loading.
- feature modules continue to own their route data and actions.

The current `SceneDirector` variant named `content` implements the Story
contract. Renaming it is unnecessary unless a later refactor has independent
value; this design vocabulary does not justify churn by itself.

### 6.2 Shared UI Responsibilities

| Primitive | Responsibility |
| --- | --- |
| `SceneStage` role | Map or authorized media with stable dimensions and crop. May be implemented by `MomentFrame`. |
| `CaptionRail` role | Identity, relationship, place, time, visibility, and precision in a stable order. |
| `MomentSheet` role | The one active mobile work surface for a selected moment. |
| `ActionRail` role | Current command plus reaction/comment state; never hidden behind the Dock. |
| `AppDock` | Exactly Map, Activity, Messages, Me. Navigation only. |
| `PublishAction` | Separate coral action; never masquerades as a fifth tab. |
| `StateSurface` role | Cause, impact, preserved work, and next action for failure/empty states. May be implemented by `AppStatusScene`. |

These are responsibilities, not a mandate to create a component for every
name. Extract only when reuse or complexity justifies it.

### 6.3 Mobile Geometry

- The scene fills the available route canvas.
- A selected map preview occupies only the height required by its content.
- The preview sheet ends above the safe-area Dock.
- The center publish action has an explicit empty axis; no text, count, or
  image may render behind it.
- The next meaningful action remains visible above the Dock or in a
  keyboard-aware action bar.
- Photos have a dedicated stable rectangle and never overlap avatar, count,
  relationship, or location text.

### 6.4 Wide Layout

At 768px and above, routes may become split views. The map or active media
remains visible beside a work rail. Desktop does not turn every section into a
floating card grid.

## 7. Surface Composition

### 7.1 Authentication

- Place context occupies the first scene; identity controls form an attached
  work surface, not a generic floating white card.
- Forms remain conventional, keyboard friendly, and immediately understandable.
- Login, registration, password reset, session expiry, validation, loading,
  and recovery share the same control vocabulary.
- Session expiry preserves selected place and draft state, explains paused
  capabilities, and offers `Sign in again` plus a valid guest/map path.

### 7.2 Map

- MapLibre owns the canvas.
- Top controls stay lightweight and preserve label readability.
- Marker selection opens one compact MomentSheet.
- Preview photo, identity, place/time, body, and action occupy separate regions.
- Opening detail begins at the marker or preview-media anchor.

### 7.3 Activity

- Activity is a chronological sequence of places, not repeated identical
  cards.
- One moment may own the stage while the next moment only peeks into view.
- Relationship and discovery scope remain explicit.
- Reactions and comments stay reachable without competing with the scene.
- Scroll-driven choreography may enhance the sequence, but content remains
  visible and usable before GSAP initializes.

### 7.4 Publishing And Footprint Detail

- Visibility and location precision remain continuously visible.
- Media, caption, privacy, and location selection survive upload or auth failure.
- Publish confirmation carries the composed media/place anchor into the new
  marker or detail scene.
- Report, block, privacy, and stranger-interaction controls remain easy to
  discover and are not hidden for visual cleanliness.

### 7.5 Messages, Notifications, People, Settings, Admin

These routes use the Work contract:

- dense, aligned rows and predictable controls;
- no cinematic page-load sequence;
- state changes use the 220ms motion tier or complete immediately;
- long lists scroll within explicit regions;
- moderation actions show impact, duration, affected identity, and audit
  consequence before confirmation;
- destructive actions remain visually distinct without flooding the route with
  coral.

### 7.6 Memories And Profile

Memories may use Story treatment when a user deliberately focuses a moment.
Timeline, map, and photo views share the same moment anchor. Routine profile
editing remains Work treatment.

## 8. GSAP Motion System

### 8.1 Ownership Boundary

GSAP owns motion with narrative or coordinated state meaning:

- route arrival and scene choreography;
- marker/preview/detail shared anchors;
- publish-to-marker confirmation;
- Activity and Memories story sequencing;
- coordinated sheet, caption, and state transitions.

CSS owns:

- layout and responsive geometry;
- hover, focus, pressed, and disabled appearance;
- skeleton shimmer or static skeleton state;
- the final no-motion state;
- simple color and border transitions that do not need sequencing.

GSAP never owns business state, routing, authorization, data fetching, map
camera truth, or component layout.

### 8.2 Motion Ladder

| Tier | Duration | Use |
| --- | --- | --- |
| Micro | 150ms | immediate control feedback when JS coordination is required |
| State | 220ms | sheet, notification, error, selection, and work-route changes |
| Route | 420ms | meaningful route arrival and Story-stage change |
| Cinematic | up to 760ms | publish confirmation or deliberate spatial focus only |

Work routes use 200-220ms. A shared-element tween may occupy roughly 480ms
inside a 760ms cinematic timeline. No routine interaction waits 760ms.

Use exponential or power eases. Bounce and elastic easing are prohibited in
product flows.

### 8.3 React Lifecycle

- Register `useGSAP` and route plugins once.
- Prefer `useGSAP` with a component scope.
- Use refs or scoped selectors; global selector animation is prohibited.
- Wrap delayed event-created animations with `contextSafe`.
- Use `revertOnUpdate` when dependencies rebuild a timeline.
- Every timeline, media query, ScrollTrigger, and plugin instance is killed or
  reverted on update and unmount.
- Search-parameter changes on the map do not replay route arrival.

### 8.4 Core, Timeline, Utilities, And Plugins

- GSAP core: transforms, `autoAlpha`, temporary CSS variables, stagger, and
  overwrite control.
- Timeline: all multi-step choreography; do not chain manual delays.
- `gsap.matchMedia`: compact/wide and `prefers-reduced-motion` setup with
  automatic revert.
- `gsap.utils`: clamp, mapRange, normalize, snap, and scoped `toArray` where
  spatial input needs them.
- `quickTo`: high-frequency pointer or camera-following values only.
- Flip: preview/detail, publish confirmation, and real layout-state changes.
- ScrollTrigger: Activity and Memories story sections only. Lazy-load it with
  the route and refresh only after relevant layout/media changes.

Do not initially use Draggable, Inertia, ScrollSmoother, SplitText,
ScrambleText, MorphSVG, physics plugins, or GSDevTools in production. They may
be proposed later for a concrete interaction. SplitText is specifically avoided
for routine Chinese/Japanese product copy and screen-reader semantics.

### 8.5 Performance

- Prefer x/y/scale/rotation and `autoAlpha`.
- Do not animate width, height, top, left, margin, or padding when a transform
  can express the same motion.
- Add `will-change` only immediately before animation and clear it afterward.
- Pause or kill inactive/off-screen timelines.
- Avoid hundreds of tweens; batch visible sequences and virtualize long lists.
- Lazy-load Flip and ScrollTrigger if they would otherwise enter the initial
  shell chunk.

### 8.6 Reduced Motion And Capability

Reduced motion is an immediate, complete product state:

- no parallax, spatial camera travel, pin pulse, scrub, or shared-element path;
- content renders visible at its final geometry;
- state may crossfade for at most 150ms when needed for comprehension;
- every action, privacy guarantee, and navigation path remains available.

## 9. Responsive, Input, And Language Rules

### 9.1 Structural Breakpoints

| Width | Contract |
| --- | --- |
| 360-479 | One stage, one sheet, safe-area Dock. |
| 480-767 | Wider phone/tablet portrait; more scene area, same action order. |
| 768-1199 | Split view where map/media context benefits the task. |
| 1200+ | Wider focus rail; content width and scan distance stay controlled. |

Typography stays fixed across these ranges. Structure changes at breakpoints.

### 9.2 Input And Accessibility

- WCAG 2.2 AA contrast is required.
- Every interactive target is at least 44x44 CSS pixels.
- Focus order follows visual order and remains visible.
- Closing a sheet or detail restores focus to its invoking marker/item.
- Every canvas/map footprint has an equivalent semantic DOM path.
- Privacy, relationship, location precision, status, and errors never rely on
  color or motion alone.
- Icon-only controls have accessible names; unfamiliar icons have tooltips.
- Software keyboard, safe areas, screen readers, touch, pointer, and keyboard
  are first-class acceptance paths.

### 9.3 Internationalization

Supported locales are `zh-CN`, `en`, and `ja`.

Resolution order:

1. persisted user preference;
2. first supported `navigator.languages` match;
3. English fallback.

All user-facing strings live in feature resources. Dates, relative time,
counts, and lists use `Intl`. Long English and Japanese controls define width
stress cases; Chinese/Japanese line breaking and punctuation are checked on
every core route. Text wraps rather than clipping or reducing below the type
floor.

## 10. Required Product States

Every applicable route implements structured loading, empty, success, partial,
offline, and failure states.

| State | Required behavior |
| --- | --- |
| Session expired | Preserve map/draft context, name paused actions, sign in again, valid guest path. |
| Location denied | Explain what still works and offer manual map placement. |
| Offline/reconnecting | Preserve truthful cached content and safely queue only supported work. |
| Upload failed | Preserve caption, privacy, precision, and location; retry the failed asset. |
| Empty discovery | Offer scope expansion or Memories; do not show an empty card shell. |
| Message restricted | Name whether reply, friendship, settings, or unblock is required. |
| Blocked relationship | Make mutual visibility and messaging consequences understandable. |
| Moderation action | Show consequence, duration, identity, audit entry, and confirmation. |
| Map tile/style failure | Separate map-provider failure from footprint-data failure and expose the semantic list. |
| Media failure | Preserve text, author, place, privacy, and interactions. |

Errors say what failed and what the user can do next. Generic apology pages and
endless centered spinners are prohibited.

## 11. Data And Architecture Boundaries

This redesign does not change domain ownership:

- identity owns users, credentials, sessions, devices, and permissions;
- footprints owns footprint content, author, location, and visibility;
- media owns uploads and footprint-media associations;
- discovery owns map/Activity eligibility and scope;
- interactions owns reactions, comments, and replies;
- social owns friendship and blocking;
- conversations owns conversations, messages, unread, read, and typing;
- memories owns personal history views;
- notifications owns in-app and push notification state;
- moderation owns reports, bans, review, and audit;
- outbox owns durable event delivery.

Visual shared components receive authorized projections and callbacks. They do
not query unrelated domains, recalculate privacy, or bypass route/module APIs.
GSAP receives DOM elements and presentation state only.

## 12. Verification And Acceptance

### 12.1 Required Viewports

- 360x800
- 390x844
- 430x932
- 768x1024
- 1024x768
- 1440x900 or 1440x1000
- 1920x1080

### 12.2 Automated Coverage

- typecheck, lint, unit/component tests, and production build;
- route-to-contract tests for every `SceneDirector` Spatial, Story/content,
  Work, and auth mapping;
- visual regression for shell, auth, map, preview, Activity, publish, detail,
  messages, Memories, notifications, people, admin, and state surfaces;
- forward and reverse shared-anchor coverage for marker -> preview -> detail ->
  map and memory -> scene -> memory;
- core journeys in all three locales, including missing-key, raw-key, `Intl`,
  and longest-string assertions beyond the shell and map;
- reduced-motion route and state coverage proving final content is visible and
  no GSAP timeline, scrub, pulse, or hidden portal remains active;
- focus order, focus restoration, accessible names, axe, and semantic map list;
- slow-network, offline, tile failure, media failure, auth expiry, location
  denial, and upload retry;
- publish-success choreography plus upload failure with draft, privacy,
  precision, media, and selected-location preservation;
- pending-action replay after sign-in for reaction, comment, report, publish,
  and message actions;
- stranger greeting, disabled stranger messaging, friendship unlock, blocking,
  notification preference/error, non-admin denial, and admin filter/error
  preservation;
- software-keyboard, safe-area, and action-above-Dock assertions at 360x800,
  390x844, and 430x932;
- helper-created browser contexts inherit the active project viewport rather
  than silently falling back to a desktop default;
- canvas/map pixel checks proving nonblank content and correct framing;
- GSAP cleanup tests proving no active timelines or ScrollTriggers remain after
  route teardown;
- representative Chromium, WebKit, and Firefox release smoke coverage;
- no horizontal overflow, clipped meaning, hidden primary action, or
  incoherent overlap at any required viewport.

### 12.3 Motion And Performance Acceptance

- route, state, and cinematic durations match the motion ladder within 30ms;
- reduced motion completes immediately or within 150ms;
- map pan/zoom and sheet interaction remain responsive during animation;
- no layout animation causes visible layout shift;
- no monotonically increasing GSAP timeline, listener, MapLibre instance, or
  WebGL context count across repeated route cycles;
- initial shell does not import route-only ScrollTrigger/Flip code when those
  plugins are lazy-loaded;
- initial shell JavaScript targets at most 160KB gzip and the separately loaded
  spatial runtime targets at most 500KB gzip; an exception must be measured,
  dated, and approved;
- LCP target is at most 2.5s and INP target is at most 200ms in the release
  profile;
- CLS target is at most 0.1 in the release profile;
- map interaction targets at least 45fps on the recorded mobile performance
  profile and at least 55fps on desktop.

### 12.4 Manual Acceptance

- real iOS and Android phone checks, including one Android device in the Pixel
  6a performance class or lower;
- bright outdoor and dark indoor readability;
- rapid marker selection, interruption, back navigation, route switching, and
  publish cancellation;
- long Chinese, English, and Japanese content;
- multi-account messaging, comments, blocking, notifications, and moderation;
- at least a 20-minute map/message/memory session for heat, memory, dropped
  frames, and battery observation.

## 13. Delivery Decomposition

The implementation plan must keep these independently runnable delivery packs;
it must not rewrite the application in one unreviewable pass:

1. tokens, shared primitives, Dock, `SceneDirector`, and the GSAP motion
   register;
2. MapLibre stage, marker/preview shared anchor, and mobile map work surface;
3. Activity sequence, footprint detail, publishing, and Memories transitions;
4. auth/session states, messages, people, notifications, and admin Work
   surfaces;
5. loading, empty, offline, upload, moderation, and error-state convergence;
6. locale completeness, keyboard/safe-area adaptation, and semantic/a11y
   coverage;
7. visual regression, motion cleanup, performance, real-device, and release
   evidence.

Each pack leaves the product runnable and preserves the existing API and module
boundaries. A pack may share tokens or primitives from an earlier pack, but it
must not require an unrelated backend refactor.

## 14. Completion Definition

The frontend upgrade is complete only when:

1. all named routes use the appropriate Spatial, Story, or Work contract;
2. the map remains Bliver's first-viewport identity;
3. map preview and Activity share one recognizable moment hierarchy;
4. session expiry and other failures preserve context and offer a clear action;
5. the coral publish action is visually singular and never covers content;
6. GSAP choreography is scoped, interruptible, cleaned up, performant, and
   fully reduced-motion compatible;
7. Chinese, English, and Japanese complete the same core journeys;
8. required mobile, desktop, accessibility, performance, and real-device
   evidence passes without a release-blocking visual defect.

## 15. Non-Goals

- backend or database redesign;
- privacy, visibility, discovery, or authorization changes;
- adding a second map engine;
- adding `motion` or Three.js in this convergence phase;
- replacing CSS layout with GSAP;
- cinematic decoration on messages, settings, notifications, or admin;
- decorative SplitText, ScrambleText, physics, particles, or perpetual loops;
- a marketing landing page;
- unrelated refactoring of domain modules.
