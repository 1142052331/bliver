import type { UserId } from '@bliver/domain';

import {
  canonicalUserPair,
  type BlockRecord,
  type FriendshipHistoryRecord,
  type FriendshipRecord,
  type RelationshipSummaryDto,
  type SocialEvent,
  type SocialRepository,
} from './ports.js';

const pairKey = (left: UserId, right: UserId): string => canonicalUserPair(left, right).join(':');
const blockKey = (blockerId: UserId, blockedId: UserId): string => `${blockerId}:${blockedId}`;

export function createMemorySocialRepository(): SocialRepository {
  const friendships = new Map<string, FriendshipRecord>();
  const friendshipIds = new Map<string, string>();
  const blocks = new Map<string, BlockRecord>();
  const idempotency = new Map<string, { fingerprint: string; response: unknown }>();
  const history: FriendshipHistoryRecord[] = [];
  const events: SocialEvent[] = [];

  const repository: SocialRepository = {
    async findFriendship(left, right) { return friendships.get(pairKey(left, right)) ?? null; },
    async findFriendshipById(id) { const key = friendshipIds.get(id); return key ? friendships.get(key) ?? null : null; },
    async findBlock(blockerId, blockedId) { return blocks.get(blockKey(blockerId, blockedId)) ?? null; },
    async listFriendships(userId) { return [...friendships.values()].filter((item) => item.userLowId === userId || item.userHighId === userId); },
    async listBlocks(blockerId) { return [...blocks.values()].filter((item) => item.blockerId === blockerId); },
    async findIdempotency(input) {
      return idempotency.get(`${input.actorId}:${input.scope}:${input.key}`) ?? null;
    },
    async saveIdempotency(input, response) {
      const key = `${input.actorId}:${input.scope}:${input.key}`;
      const prior = idempotency.get(key);
      if (prior && prior.fingerprint !== input.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
      if (prior) return prior.response;
      idempotency.set(key, { fingerprint: input.fingerprint, response });
      return response;
    },
    async writeFriendship(input) {
      if (input.idempotency) {
        const prior = await repository.findIdempotency(input.idempotency);
        if (prior && prior.fingerprint !== input.idempotency.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        if (prior) return prior.response as FriendshipRecord;
      }
      const key = pairKey(input.record.userLowId, input.record.userHighId);
      friendships.set(key, input.record);
      friendshipIds.set(input.record.id, key);
      history.push(input.history);
      if (input.event) events.push(input.event);
      if (input.idempotency) await repository.saveIdempotency(input.idempotency, input.record);
      return input.record;
    },
    async removeFriendship(input) {
      if (input.idempotency) {
        const prior = await repository.findIdempotency(input.idempotency);
        if (prior && prior.fingerprint !== input.idempotency.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        if (prior) return;
      }
      const key = pairKey(input.record.userLowId, input.record.userHighId);
      friendships.delete(key);
      friendshipIds.delete(input.record.id);
      events.push(input.event);
      if (input.idempotency) await repository.saveIdempotency(input.idempotency, { removed: true });
    },
    async writeBlock(input) {
      if (input.idempotency) {
        const prior = await repository.findIdempotency(input.idempotency);
        if (prior && prior.fingerprint !== input.idempotency.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        if (prior) return prior.response as BlockRecord;
      }
      if (input.removedFriendship) {
        const key = pairKey(input.removedFriendship.userLowId, input.removedFriendship.userHighId);
        friendships.delete(key);
        friendshipIds.delete(input.removedFriendship.id);
        if (input.friendshipRemovedEvent) events.push(input.friendshipRemovedEvent);
      }
      blocks.set(blockKey(input.record.blockerId, input.record.blockedId), input.record);
      events.push(input.event);
      if (input.idempotency) await repository.saveIdempotency(input.idempotency, input.record);
      return input.record;
    },
    async removeBlock(input) {
      if (input.idempotency) {
        const prior = await repository.findIdempotency(input.idempotency);
        if (prior && prior.fingerprint !== input.idempotency.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        if (prior) return;
      }
      blocks.delete(blockKey(input.record.blockerId, input.record.blockedId));
      events.push(input.event);
      if (input.idempotency) await repository.saveIdempotency(input.idempotency, { removed: true });
    },
    async listHistory(friendshipId) { return history.filter((item) => item.friendshipId === friendshipId); },
    async listEvents() { return [...events]; },
    async areFriends(left, right) { return (await repository.findFriendship(left, right))?.status === 'accepted' && !(await repository.isBlocked(left, right)); },
    async isBlocked(left, right) { return blocks.has(blockKey(left, right)) || blocks.has(blockKey(right, left)); },
    async getPendingRequest(left, right) {
      if (await repository.isBlocked(left, right)) return null;
      const record = await repository.findFriendship(left, right);
      return record?.status === 'pending' ? record : null;
    },
    async getRelationshipSummary(actor, target): Promise<RelationshipSummaryDto> {
      if (await repository.isBlocked(actor, target)) return { state: 'blocked' };
      const record = await repository.findFriendship(actor, target);
      if (!record || record.status === 'rejected') return { state: 'none' };
      if (record.status === 'accepted') return { state: 'friends' };
      return record.requesterId === actor
        ? { state: 'pending-outgoing', requestId: record.id }
        : { state: 'pending-incoming', requestId: record.id };
    },
  };
  return repository;
}
