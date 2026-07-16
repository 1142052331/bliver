# Bliver V2 Phase 3 Map and Footprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the map-first publishing loop with PostGIS viewport queries, location privacy, Cloudinary signed media, a single footprint detail surface, and reliable Outbox/Socket publication.

**Architecture:** Footprints owns publishing and privacy. Geography and Media are infrastructure ports. Discovery is not introduced yet; Phase 3 provides owner/friend/public map reads needed by the core map. Every successful write persists the footprint and Outbox event in one transaction.

**Tech Stack:** PostgreSQL/PostGIS, Drizzle, Express 5, Zod/OpenAPI, Cloudinary, Socket.IO, React Leaflet, TanStack Query, Playwright.

---

## Files and ownership

- Create migrations: `apps/api/drizzle/0002_geography_media_footprints.sql`.
- Create modules: `apps/api/src/modules/geography`, `apps/api/src/modules/media`, `apps/api/src/modules/footprints`.
- Create platform adapters: `apps/api/src/platform/cloudinary`, `apps/api/src/platform/geocoding`, `apps/api/src/platform/outbox`.
- Create contracts: `packages/contracts/src/geography.ts`, `packages/contracts/src/footprints.ts`, `packages/contracts/src/media.ts`.
- Create Web features: `apps/web/src/features/map`, `apps/web/src/features/footprints`.
- Modify: `apps/api/src/realtime`, `apps/web/src/app/router.tsx`, `packages/domain/src/visibility.ts`.
- Create evidence: `docs/qa/v2-phase-3-map-footprints.md`.

## Canonical interfaces

```ts
export interface PublishFootprintInput {
  message: string;
  mood?: string;
  privatePoint: { lat: number; lng: number };
  visibility: 'public' | 'friends' | 'private';
  locationPrecision: 'precise' | 'approximate';
  mediaAssetIds: readonly string[];
}

export interface FootprintDto {
  id: FootprintId;
  author: { id: UserId; name: string; avatarUrl?: string };
  displayPoint: { lat: number; lng: number };
  visibility: 'public' | 'friends' | 'private';
  locationPrecision: 'precise' | 'approximate';
  publishedAt: string;
  discoveryExpiresAt?: string;
}

export interface FootprintVisibilityPolicy {
  canRead(actor: ActorContext | null, footprintId: FootprintId): Promise<boolean>;
  toPublicDto(actor: ActorContext | null, record: FootprintPolicyInput): Promise<FootprintDto>;
}

export interface FootprintPolicyInput {
  id: FootprintId;
  authorId: UserId;
  privatePoint: { lat: number; lng: number };
  displayPoint: { lat: number; lng: number };
  visibility: 'public' | 'friends' | 'private';
  locationPrecision: 'precise' | 'approximate';
}
```

No public DTO contains `privatePoint`.

## Task 1: Model geography and footprint storage

- [ ] Write PostGIS integration tests for `geography(Point, 4326)`, viewport bounding-box queries, display point indexes, visibility indexes, and discovery expiry indexes.
- [ ] Add tables `footprints`, `footprint_media`, `places`, and `regions` with UUIDv7 IDs, author foreign keys, `private_point`, `display_point`, visibility, precision, message, mood, `published_at`, `discovery_expires_at`, and audit timestamps.
- [ ] Add constraints preventing missing display points, invalid visibility/precision values, and media rows without a footprint owner.
- [ ] Add GiST indexes for display points and B-tree indexes for author/visibility/expiry combinations.
- [ ] Run migration twice and commit `feat: add footprint and geography persistence`.

## Task 2: Implement privacy and location policies

- [ ] Write property tests for guest, owner, accepted friend, blocked user, moderator case access, precise and approximate output.
- [ ] Implement `FootprintVisibilityPolicy` with `canRead`, `readFilter`, `toPublicDto`, and `toOwnerDto` methods. The policy must require an explicit `ActorContext`.
- [ ] Implement deterministic approximate offset generation at publish time; never randomize coordinates per request.
- [ ] Ensure `private_point` is excluded from generic select lists and DTO serializers.
- [ ] Add tests proving blocks override friendship and that public discovery expiry does not delete owner history.
- [ ] Commit `feat: enforce V2 footprint privacy policy`.

## Task 3: Add Cloudinary signed upload boundary

- [ ] Write adapter contract tests for signed upload parameters, invalid MIME/size, missing configuration, and asset ownership.
- [ ] Implement `MediaService` and `CloudinaryAdapter`; return stable public ID, version, dimensions and format, never a long-lived signed URL.
- [ ] Add `POST /api/v1/media/signature` and `DELETE /api/v1/media/:assetId` routes behind authentication and ownership checks.
- [ ] Add rate limits and idempotency for signature requests.
- [ ] Commit `feat: add V2 media upload boundary`.

## Task 4: Implement publish and footprint commands

- [ ] Write application tests for publish, update visibility, delete, and owner readback.
- [ ] Implement `PublishFootprint`, `UpdateFootprintVisibility`, and `DeleteFootprint` commands. The publish transaction must write footprint, media reference, and `FootprintPublished` Outbox event together.
- [ ] Resolve geocoding and weather outside the transaction with bounded timeouts; a provider failure stores a safe null metadata result and never aborts the user publication.
- [ ] Require an Idempotency-Key and return the original result for a replay.
- [ ] Map domain conflicts to Problem Details `409` codes.
- [ ] Commit `feat: add transactional footprint publishing`.

## Task 5: Implement map reads

- [ ] Write repository tests for guest global reads, authenticated relationship reads, viewport bounds, filters, pagination limits, and empty results.
- [ ] Implement `MapFootprintQuery` using PostGIS display points and the privacy policy. Enforce a maximum result count and stable order.
- [ ] Add `GET /api/v1/map/footprints`, `GET /api/v1/places/search`, and `POST /api/v1/location/resolve` contracts/routes.
- [ ] Add API tests proving no private point or blocked content leaks through map queries.
- [ ] Commit `feat: add PostGIS map queries`.

## Task 6: Add Outbox and realtime publication

- [ ] Write integration tests for transaction rollback, event claiming with `FOR UPDATE SKIP LOCKED`, retry count, idempotent processing, and dead-letter status.
- [ ] Implement `outbox_events` fields `id`, `type`, `aggregate_id`, `payload`, `available_at`, `claimed_at`, `attempts`, `processed_at`, and `last_error`.
- [ ] Implement an API-local worker loop with bounded batch size and exponential backoff; do not broadcast before the transaction commits.
- [ ] Add shared Socket event `footprint:published` and a client adapter that invalidates or patches the map query.
- [ ] Test reconnect behavior by forcing a missed event and requiring a Query resync.
- [ ] Commit `feat: publish footprint events reliably`.

## Task 7: Build the map and footprint Web features

- [ ] Write component tests for map loading/empty/error/offline states, viewport changes, privacy labels, publish form validation, upload failure recovery, and detail sheet close/back behavior.
- [ ] Implement `MapRoute`, `MapCanvas`, `MapControls`, `FootprintMarkers`, `FootprintPreview`, `FootprintDetailRoute`, and `PublishFootprintRoute` under the feature boundary.
- [ ] Keep map range, filters, selected footprint and open sheet in URL state; keep server data in Query.
- [ ] Use Natural City tokens, 44px controls, reduced-motion marker pulse and no black glass/gradient surfaces.
- [ ] Add Playwright smoke for guest map, authenticated publish, precise/approximate labels, and detail deep links.
- [ ] Commit `feat: add V2 map and footprint experience`.

## Phase 3 exit gate

Run:

```text
npm.cmd run db:v2:migrate
npm.cmd run typecheck:v2
npm.cmd run lint:v2
npm.cmd run test:v2
npm.cmd run build:v2
npx playwright test apps/web/e2e/map-footprints.spec.ts
```

The phase passes only when a user can publish from the map, privacy tests prove precise coordinates never leak, Cloudinary failures are recoverable, Outbox events are durable, and the map/detail flow works at 390x844 and 1440x1000. Commit `docs/qa/v2-phase-3-map-footprints.md` and tag the accepted SHA as `v2-phase-3-map-footprints`.
