import type { LegacyRecord } from '../adapters/fixture-source.js';
import { DeterministicIdRegistry } from './ids.js';
import { MigrationError } from './types.js';

const date = (value: unknown): Date => new Date(String(value));

export function transformSocial(
  friendshipSources: readonly LegacyRecord[],
  blockSources: readonly LegacyRecord[],
  ids = new DeterministicIdRegistry(),
) {
  const pairs = new Set<string>();
  const friendships = friendshipSources.map((source) => {
    const requesterId = ids.id('user', String(source.requester));
    const addresseeId = ids.id('user', String(source.recipient));
    if (requesterId === addresseeId) throw new MigrationError('FRIENDSHIP_SELF');
    const [userLowId, userHighId] = [requesterId, addresseeId].sort() as [string, string];
    const pair = `${userLowId}:${userHighId}`;
    if (pairs.has(pair)) throw new MigrationError('FRIENDSHIP_PAIR_CONFLICT');
    pairs.add(pair);
    return { id: ids.id('friendship', String(source._id)), userLowId, userHighId, requesterId, addresseeId, status: String(source.status) as 'pending' | 'accepted', createdAt: date(source.createdAt), updatedAt: date(source.updatedAt) };
  });
  const history = friendshipSources.map((source, index) => ({
    id: ids.id('friendship-history', String(source._id)),
    friendshipId: friendships[index]!.id,
    fromStatus: null,
    toStatus: friendships[index]!.status,
    actorId: friendships[index]!.requesterId,
    occurredAt: date(source.createdAt),
  }));
  const blockPairs = new Set<string>();
  const blocks = blockSources.map((source) => {
    const blockerId = ids.id('user', String(source.blockerId));
    const blockedId = ids.id('user', String(source.blockedId));
    if (blockerId === blockedId) throw new MigrationError('BLOCK_SELF');
    const pair = `${blockerId}:${blockedId}`;
    if (blockPairs.has(pair)) throw new MigrationError('BLOCK_PAIR_CONFLICT');
    blockPairs.add(pair);
    return { blockerId, blockedId, createdAt: date(source.createdAt) };
  });
  return { friendships, history, blocks };
}
