import {
  createFootprintId,
  createUserId,
  type FootprintId,
  type UserId,
} from '@bliver/domain';
import { describe, expect, it } from 'vitest';

import type { ActorContext } from '../../../identity/index.js';
import {
  FootprintAccessDeniedError,
  FootprintVisibilityPolicy,
  type FootprintPolicyInput,
  type FootprintVisibilityPolicyPorts,
} from '../../index.js';

const now = new Date('2026-07-15T08:00:00.000Z');
const ownerId = createUserId();
const friendId = createUserId();
const strangerId = createUserId();
const blockedId = createUserId();
const moderatorId = createUserId();

function actor(
  userId: UserId,
  roles: ActorContext['roles'] = ['user'],
): ActorContext {
  return {
    userId,
    sessionId: `session-${userId}`,
    roles,
    transport: 'cookie',
  };
}

function footprint(
  overrides: Partial<FootprintPolicyInput> = {},
): FootprintPolicyInput {
  return {
    id: createFootprintId(),
    authorId: ownerId,
    author: {
      name: 'Alice',
      avatarUrl: 'https://cdn.example/alice.jpg',
    },
    privatePoint: { lat: 31.2304, lng: 121.4737 },
    displayPoint: { lat: 31.232, lng: 121.476 },
    visibility: 'public',
    locationPrecision: 'approximate',
    publishedAt: new Date('2026-07-15T07:00:00.000Z'),
    discoveryExpiresAt: new Date('2026-07-15T09:00:00.000Z'),
    ...overrides,
  };
}

function createPolicy(
  records: readonly FootprintPolicyInput[],
  options: {
    readonly friends?: ReadonlySet<string>;
    readonly blocked?: ReadonlySet<string>;
    readonly moderationCases?: ReadonlySet<FootprintId>;
  } = {},
): FootprintVisibilityPolicy {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const ports: FootprintVisibilityPolicyPorts = {
    records: {
      async findById(id) {
        return recordsById.get(id) ?? null;
      },
    },
    friendships: {
      async areAcceptedFriends(viewerId, authorId) {
        return (
          authorId === ownerId && (options.friends?.has(viewerId) ?? false)
        );
      },
    },
    blocks: {
      async isEitherBlocked(viewerId, authorId) {
        return (
          authorId === ownerId && (options.blocked?.has(viewerId) ?? false)
        );
      },
    },
    moderation: {
      async hasCaseAccess(viewerId, footprintId) {
        return (
          viewerId === moderatorId &&
          (options.moderationCases?.has(footprintId) ?? false)
        );
      },
    },
    now: () => now,
  };

  return new FootprintVisibilityPolicy(ports);
}

describe('FootprintVisibilityPolicy access table', () => {
  const activePublic = footprint();
  const expiredPublic = footprint({
    discoveryExpiresAt: new Date('2026-07-15T07:59:59.999Z'),
  });
  const friendsOnly = footprint({ visibility: 'friends' });
  const privateFootprint = footprint({ visibility: 'private' });
  const allRecords = [
    activePublic,
    expiredPublic,
    friendsOnly,
    privateFootprint,
  ];

  it.each([
    ['guest sees active public discovery', null, activePublic, true],
    ['guest cannot see expired public discovery', null, expiredPublic, false],
    ['guest cannot see friends-only footprints', null, friendsOnly, false],
    ['owner sees private history', actor(ownerId), privateFootprint, true],
    [
      'accepted friend sees friends-only footprints',
      actor(friendId),
      friendsOnly,
      true,
    ],
    [
      'accepted friend keeps access after public discovery expires',
      actor(friendId),
      expiredPublic,
      true,
    ],
    [
      'stranger cannot see expired public discovery',
      actor(strangerId),
      expiredPublic,
      false,
    ],
    [
      'accepted friend cannot see private footprints',
      actor(friendId),
      privateFootprint,
      false,
    ],
    [
      'moderator with case access sees private footprints',
      actor(moderatorId, ['moderator']),
      privateFootprint,
      true,
    ],
  ] as const)(
    '%s',
    async (_name, viewer, record, expected) => {
      const policy = createPolicy(allRecords, {
        friends: new Set([friendId]),
        moderationCases: new Set([privateFootprint.id]),
      });

      await expect(policy.canRead(viewer, record.id)).resolves.toBe(expected);
    },
  );

  it('requires a moderation case instead of granting access by role alone', async () => {
    const policy = createPolicy([privateFootprint]);

    await expect(
      policy.canRead(actor(moderatorId, ['moderator']), privateFootprint.id),
    ).resolves.toBe(false);
  });

  it('lets blocks override an accepted friendship', async () => {
    const policy = createPolicy([friendsOnly], {
      friends: new Set([blockedId]),
      blocked: new Set([blockedId]),
    });

    await expect(
      policy.canRead(actor(blockedId), friendsOnly.id),
    ).resolves.toBe(false);
  });

  it('uses the same rules when filtering records', async () => {
    const policy = createPolicy(allRecords, {
      friends: new Set([friendId]),
    });

    await expect(policy.readFilter(actor(friendId), allRecords)).resolves.toEqual(
      [activePublic, expiredPublic, friendsOnly],
    );
  });
});

describe('FootprintVisibilityPolicy DTO boundaries', () => {
  it('serializes a public DTO without the private point', async () => {
    const record = footprint();
    const policy = createPolicy([record]);

    const dto = await policy.toPublicDto(null, record);

    expect(dto).toEqual({
      id: record.id,
      author: {
        id: ownerId,
        name: 'Alice',
        avatarUrl: 'https://cdn.example/alice.jpg',
      },
      displayPoint: record.displayPoint,
      visibility: 'public',
      locationPrecision: 'approximate',
      publishedAt: '2026-07-15T07:00:00.000Z',
      discoveryExpiresAt: '2026-07-15T09:00:00.000Z',
    });
    expect('privatePoint' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('privatePoint');
    expect(JSON.stringify(dto)).not.toContain('31.2304');
  });

  it('does not randomize a stored display point between DTO requests', async () => {
    const record = footprint();
    const policy = createPolicy([record]);

    const first = await policy.toPublicDto(null, record);
    const second = await policy.toPublicDto(null, record);

    expect(first.displayPoint).toEqual(record.displayPoint);
    expect(second.displayPoint).toEqual(first.displayPoint);
  });

  it('rejects public serialization when the actor cannot read the record', async () => {
    const record = footprint({ visibility: 'private' });
    const policy = createPolicy([record]);

    await expect(policy.toPublicDto(null, record)).rejects.toBeInstanceOf(
      FootprintAccessDeniedError,
    );
  });

  it('returns the private point only through the owner DTO', async () => {
    const record = footprint({ visibility: 'private' });
    const policy = createPolicy([record]);

    await expect(policy.toOwnerDto(actor(ownerId), record)).resolves.toMatchObject({
      privatePoint: record.privatePoint,
    });
    await expect(
      policy.toOwnerDto(actor(friendId), record),
    ).rejects.toBeInstanceOf(FootprintAccessDeniedError);
  });

  it('keeps expired public records in owner history', async () => {
    const record = footprint({
      discoveryExpiresAt: new Date('2026-07-15T07:00:00.000Z'),
    });
    const policy = createPolicy([record]);

    await expect(policy.toOwnerDto(actor(ownerId), record)).resolves.toMatchObject({
      id: record.id,
      discoveryExpiresAt: '2026-07-15T07:00:00.000Z',
    });
    await expect(policy.canRead(null, record.id)).resolves.toBe(false);
    await expect(policy.canRead(actor(strangerId), record.id)).resolves.toBe(
      false,
    );
  });
});
