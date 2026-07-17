import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { FixtureSource, type LegacyCollections } from '../adapters/fixture-source.js';
import { transformSocial } from '../domain/social.js';

let source: LegacyCollections;
beforeEach(async () => { source = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections()); });

describe('legacy social transformation', () => {
  it('orders pairs and creates an explicit initial friendship history', () => {
    const result = transformSocial(source.Friendship, source.Block);
    const friendship = result.friendships[0]!;
    expect(friendship.userLowId < friendship.userHighId).toBe(true);
    expect(result.history).toContainEqual(expect.objectContaining({
      friendshipId: friendship.id, fromStatus: null, toStatus: 'accepted', actorId: friendship.requesterId,
    }));
    expect(result.blocks).toHaveLength(1);
  });

  it('blocks duplicate unordered friendships and self relationships', () => {
    source.Friendship.push({ ...source.Friendship[0], _id: '507f1f77bcf86cd799439172', requester: source.Friendship[0]!.recipient, recipient: source.Friendship[0]!.requester });
    expect(() => transformSocial(source.Friendship, source.Block)).toThrow('FRIENDSHIP_PAIR_CONFLICT');
    source.Friendship.splice(1);
    source.Block[0]!.blockedId = source.Block[0]!.blockerId;
    expect(() => transformSocial(source.Friendship, source.Block)).toThrow('BLOCK_SELF');
  });
});
