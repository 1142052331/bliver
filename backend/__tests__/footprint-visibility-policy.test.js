const { canReadFootprint } = require('../policies/FootprintVisibilityPolicy');

describe('canReadFootprint', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');
  const activePublic = {
    userId: 'owner',
    visibility: 'public',
    discoveryExpiresAt: new Date('2026-07-12T12:00:00.000Z'),
  };

  test('allows guests to read active public footprints', () => {
    expect(canReadFootprint({ footprint: activePublic, now })).toBe(true);
  });

  test('denies guests and strangers after public discovery expires', () => {
    const expired = { ...activePublic, discoveryExpiresAt: new Date('2026-07-10T12:00:00.000Z') };
    expect(canReadFootprint({ footprint: expired, now })).toBe(false);
    expect(canReadFootprint({ footprint: expired, viewerId: 'stranger', now })).toBe(false);
  });

  test('keeps expired public footprints readable by owner and accepted friends', () => {
    const expired = { ...activePublic, discoveryExpiresAt: new Date('2026-07-10T12:00:00.000Z') };
    expect(canReadFootprint({ footprint: expired, viewerId: 'owner', now })).toBe(true);
    expect(canReadFootprint({ footprint: expired, viewerId: 'friend', friendIds: new Set(['owner']), now })).toBe(true);
  });

  test.each(['friends', 'private'])('denies guests for %s visibility', (visibility) => {
    expect(canReadFootprint({ footprint: { ...activePublic, visibility }, now })).toBe(false);
  });

  test('allows friends visibility only to owner, accepted friends, and admins', () => {
    const footprint = { ...activePublic, visibility: 'friends' };
    expect(canReadFootprint({ footprint, viewerId: 'owner', now })).toBe(true);
    expect(canReadFootprint({ footprint, viewerId: 'friend', friendIds: new Set(['owner']), now })).toBe(true);
    expect(canReadFootprint({ footprint, viewerId: 'stranger', now })).toBe(false);
    expect(canReadFootprint({ footprint, viewerId: 'admin', isAdmin: true, now })).toBe(true);
  });

  test('allows private visibility only to owner and admins', () => {
    const footprint = { ...activePublic, visibility: 'private' };
    expect(canReadFootprint({ footprint, viewerId: 'owner', now })).toBe(true);
    expect(canReadFootprint({ footprint, viewerId: 'friend', friendIds: new Set(['owner']), now })).toBe(false);
    expect(canReadFootprint({ footprint, viewerId: 'admin', isAdmin: true, now })).toBe(true);
  });

  test('treats legacy footprints without visibility as public during backfill', () => {
    expect(canReadFootprint({ footprint: { userId: 'owner' }, now })).toBe(true);
  });
});
