import { describe, expect, it } from 'vitest';

import {
  V2_TEST_FOOTPRINTS,
  V2_TEST_SOCIAL,
  V2_TEST_USERS,
  createJourneyState,
  visibleFootprintsFor,
} from '../index.js';

describe('V2 deterministic browser fixtures', () => {
  it('defines the four required actors without production credentials', () => {
    expect(Object.keys(V2_TEST_USERS)).toEqual(['guest', 'admin', 'userA', 'userB']);
    expect(V2_TEST_USERS.guest).toBeNull();
    expect(V2_TEST_USERS.admin.roles).toEqual(['admin']);
    expect(V2_TEST_USERS.userA.id).not.toBe(V2_TEST_USERS.userB.id);
    expect(V2_TEST_USERS.userA.fixtureOnly).toBe(true);
  });

  it('covers public, friends and private visibility with both precision modes', () => {
    expect(new Set(V2_TEST_FOOTPRINTS.map((item) => item.visibility))).toEqual(
      new Set(['public', 'friends', 'private']),
    );
    expect(new Set(V2_TEST_FOOTPRINTS.map((item) => item.locationPrecision))).toEqual(
      new Set(['precise', 'approximate']),
    );
  });

  it('applies deterministic visibility without exposing private fixtures', () => {
    expect(visibleFootprintsFor('guest').map((item) => item.visibility)).toEqual(['public']);
    expect(visibleFootprintsFor('userB').map((item) => item.visibility)).toEqual([
      'public',
      'friends',
    ]);
    expect(visibleFootprintsFor('userA').map((item) => item.visibility)).toEqual([
      'public',
      'friends',
      'private',
    ]);
  });

  it('creates isolated journey state from stable social identifiers', () => {
    const first = createJourneyState();
    const second = createJourneyState();
    first.blockedUserIds.add(V2_TEST_USERS.userB.id);
    expect(second.blockedUserIds.size).toBe(0);
    expect(first.conversationId).toBe(V2_TEST_SOCIAL.conversationId);
  });
});
