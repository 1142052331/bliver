# Phase 7: Profile and Memories Implementation Plan

## 1. Lock the failing contract

- Add `MeExperience` component tests for loading, overview tabs, route stop selection, timeline/photo callback wiring, and visitor privacy copy.
- Run the focused Vitest file and confirm the new tests fail because the component does not exist.

## 2. Build the destination surface

- Implement `MeExperience` with `useProfileData`, semantic tabs, Natural City surface tokens, compact stats, memory route strip, and actionable empty/error states.
- Keep callbacks explicit so `App` owns drawer/photo/detail state.
- Add a small `MemoryRoute` presentational component only where it reduces complexity.

## 3. Wire Me into the shell

- Update `LegacyDestinationBridge` and `App` so the `me` destination renders `MeExperience` for the signed-in owner.
- Keep profile drawer behavior for other users and preserve close/back semantics, bottom-navigation reservation, and logout.
- Route timeline/photo entry points through existing handlers.

## 4. Refine and verify

- Run focused frontend tests, the full frontend suite, typecheck/build, and `git diff --check`.
- Review responsive behavior at the canonical 390x844 mobile viewport and a desktop viewport; adjust only scoped styles.
- Run the existing backend profile/visibility tests to ensure no API contract changed.

