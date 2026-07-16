# Bliver Mobile Redesign Delivery Roadmap

> This index decomposes the approved redesign into independently testable plans. Each phase must leave production usable and preserve a rollback path.

## Phase Plans

1. **Design Foundations and Mobile App Shell** — tokens, primitives, four-destination mobile navigation, independent check-in action, responsive shell, legacy compatibility bridge.
2. **Map Home Redesign** — Natural City map styling, markers, top controls, selection preview card, footprint pulse, map loading/error states.
3. **Visibility and Unified Activity** — footprint visibility fields, discovery expiry and indexes, intelligent regional fallback API, chronological Activity page.
4. **Footprint Detail and Public Conversation** — full detail page/sheet, reactions, two-level chronological comments, moderation and reports.
5. **Privacy-Aware Check-in** — visibility selection, remembered default, precise/approximate preview, publish state and upload recovery.
6. **Stranger Messaging and Blocking** — greeting gate, reply unlock, preferences, reports, blocks, conversation list and chat states.
7. **Profile and Memories** — open public profile, authoritative visibility, owner-only visitors, personal map, timeline and memory entry points.
8. **Legacy Surface Adaptation and Hardening** — admin/photo/announcement theme adaptation, route splitting, accessibility, performance, observability and regression cleanup.

## Sequencing Rules

- Do not begin a phase until the previous phase's focused tests, frontend build, and mobile smoke test pass.
- Keep legacy UI available until its replacement phase passes acceptance tests.
- Do not migrate historical footprint visibility during these phases.
- Do not add following, reposting, or deeper-than-two-level comments.
- Use Node.js 20 for development and CI parity.

## Approved Source of Truth

- Product strategy: `PRODUCT.md`
- Visual system: `DESIGN.md`
- Functional design: `docs/superpowers/specs/2026-07-10-mobile-core-redesign-design.md`
