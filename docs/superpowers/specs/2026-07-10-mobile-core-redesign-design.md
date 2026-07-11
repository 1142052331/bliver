# Bliver Mobile Core Redesign

## Summary
Redesign Bliver as a mobile-first location social network using the A1 “Natural City” direction. Preserve the map as the default home while adding a unified chronological activity stream, explicit footprint visibility, regional public discovery, public threaded comments, restricted stranger messaging, open profiles, blocking, and reporting.

The implementation uses a vertical-slice migration: establish the new shell and design system, then replace the map, activity, footprint detail, publishing, messaging, and profile flows one at a time while keeping existing features operational. The admin panel, photo wall, and announcement center receive visual compatibility only during this phase.

## Product Experience
### Mobile App Structure
- Four bottom-navigation destinations: Map, Activity, Messages, and Me.
- Check-in is an independent primary action, not a navigation destination.
- The Map is the default route and remains visible behind footprint previews and spatial detail sheets.
- Activity, Messages, and Me are full pages rather than stacked floating drawers.
- Desktop preserves the mobile information architecture and adapts with wider or split layouts.

### Map
- Show friend footprints and eligible public footprints with explicit relationship or scope treatment.
- Provide lightweight region, search, scope, filter, and locate controls.
- Selecting a footprint opens one bottom preview card; expanding it enters full detail.
- A new footprint may play one reduced-motion-aware pulse animation.

### Unified Activity
- Combine friend and public footprints in one stream.
- Sort all items strictly by publication time descending; do not boost friends.
- Label each item as friend, same first-level administrative region, same country, or global.
- Default discovery intelligently fills from the current first-level administrative region, then the current country, then global content.
- Users can fix a scope manually and disable intelligent supplementation.
- Public footprints leave stranger discovery after 24 hours but remain in owner history and continue to obey normal visibility rules.

### Footprint Publishing
- Add public, friends, and private visibility.
- First publication defaults to public; subsequent publications reuse the user's previous selection.
- Preserve the existing independent precise/approximate location selection.
- Show the active audience and location precision beside the publish action and preview what others will see.
- Do not migrate legacy footprints. A footprint without the new visibility field does not enter stranger discovery.

### Public Interaction
- Public footprints support reactions, chronological public comments, two-level replies, direct-message greetings, friend requests, reports, and blocks.
- Top-level comments and replies within a thread use oldest-first ordering.
- Comment authors can delete their own comments; footprint owners can moderate comments on their footprint.
- Following, followers, reposting, and deeper nesting are out of scope.

### Stranger Messaging and Blocking
- A stranger can send one greeting message from a public footprint or open profile.
- Normal conversation unlocks only after the recipient replies.
- Users can disable stranger messages.
- Users can delete a conversation, report a user or content item, and block another user.
- Blocking makes profiles, visible content, comments, and messages mutually unavailable.

### Profiles and Memories
- Profiles remain open to strangers: avatar, bio, online state, friend list, public photos, and public footprints are visible.
- Friends and private footprint visibility remains authoritative on an open profile.
- Profile visitor history is visible only to the profile owner.
- Me includes the personal map, footprint timeline, photos, and memory experiences such as “on this day” and monthly summaries.

## Visual System
- Adopt the DESIGN.md Natural City tokens and component rules.
- Use warm paper, sage, forest, and restrained coral; remove the current black glassmorphism and neon styling from the redesigned core flow.
- Use a legible sans-serif system for product UI and reserve the serif face for the wordmark or rare memory headings.
- Use one consistent icon family, three radius levels, soft elevation, 44px minimum touch targets, safe-area support, and 150–250ms state transitions.
- Only one major bottom sheet may be open at a time.
- Meet WCAG 2.2 AA contrast and support reduced motion, screen readers, visible focus, dynamic keyboards, slow networks, offline states, location denial, and upload failure.

## Architecture and Interfaces
### Frontend State
- Introduce a mobile App Shell that owns routing, bottom navigation, safe areas, global sheets, toasts, and the independent check-in action.
- Use React Query as the source of truth for server state and cache updates.
- Use Zustand only for cross-page UI state; local component state is limited to forms and transient interaction.
- Route-split Map, Activity, Messages, Me, and secondary legacy surfaces.
- Socket.IO domain events update React Query caches or invalidate queries instead of maintaining parallel server-state copies.
- Replace old core components incrementally and retain rollback paths until each slice passes acceptance tests.

### Backend Data
- Extend footprints with explicit visibility, public-discovery expiry, country, and first-level administrative region fields plus indexes required by the discovery query.
- Extend comments to support a parent top-level comment and reply target while enforcing a maximum of two levels.
- Add stranger-message conversation state and a user preference for allowing stranger greetings.
- Add block and report persistence with authorization checks.
- Historical footprints remain unchanged and are excluded from stranger discovery unless explicitly updated later.

### Backend APIs
- Add a discovery/activity endpoint that returns a single reverse-chronological stream and reports the source scope for every item.
- The intelligent fallback fills from province/state/prefecture, then country, then global without duplicating footprints.
- Add or extend endpoints for footprint visibility, two-level comments, stranger greeting state, message preference, block/unblock, and reports.
- Every read and mutation enforces visibility, block state, ownership, stranger-message state, and moderation permissions on the server.
- API responses expose enough relationship and scope metadata for labels without requiring the client to infer authorization.

## Delivery Sequence
1. Add product/design context, tokens, core primitives, routing shell, and bottom navigation.
2. Replace the mobile Map home and footprint preview interaction.
3. Add footprint visibility, discovery expiry, region indexing, discovery API, and the Activity page.
4. Replace footprint detail, reactions, chronological two-level comments, moderation, and reporting.
5. Replace the check-in flow with audience, precision, and privacy preview.
6. Add stranger greetings, conversation unlocking, message preferences, blocking, and the Messages page.
7. Replace the profile and Me experience, including personal map and memory entry points.
8. Apply design compatibility to legacy secondary surfaces, then complete performance, accessibility, and regression cleanup.

## Test Plan
- Backend tests cover visibility authorization, legacy exclusion, 24-hour discovery expiry, intelligent fallback order, strict chronological ordering, deduplication, comment depth, moderation, stranger greeting limits, conversation unlocking, message preferences, reports, and blocking.
- Frontend tests cover navigation, scope labels, intelligent fallback controls, publishing defaults, persisted visibility choice, privacy preview, comment replies, greeting state, block/report flows, and profile visitor confidentiality.
- Mobile end-to-end tests cover registration/login, check-in, public discovery, reaction/comment/reply, stranger greeting and reply, friend request, block, and token expiration.
- Validate at 390×844, a small Android viewport, and a large phone viewport; verify safe areas and keyboard behavior.
- Validate slow network, offline mode, denied location, empty discovery, expired discovery, failed upload, unavailable profile, blocked content, and expired authentication.
- Confirm route-level code splitting keeps admin, photo wall, chat detail, and profile modules out of the initial Map bundle.
- Confirm WCAG AA contrast, 44px touch targets, screen-reader labels, visible focus, and reduced-motion behavior.

## Assumptions and Boundaries
- Mobile is the product priority; desktop remains usable but does not drive information architecture.
- Existing backend and database remain the migration foundation; this is not a clean rewrite.
- Legacy footprints are neither migrated nor exposed to stranger discovery in this phase.
- Public discovery is based on administrative region rather than fixed-distance radius because early user density is low.
- Admin, photo wall, and announcements are visually adapted only; their feature models are unchanged.
- Following, followers, reposting, unlimited nested comments, and historical visibility migration are deferred.
