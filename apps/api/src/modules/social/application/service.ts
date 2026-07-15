import { createEventId, type UserId } from '@bliver/domain';

import {
  canonicalUserPair,
  type BlockRecord,
  type FriendshipHistoryRecord,
  type FriendshipRecord,
  type SocialEvent,
  type SocialRepository,
} from './ports.js';

export type SocialErrorCode =
  | 'SELF_RELATIONSHIP'
  | 'RELATIONSHIP_NOT_FOUND'
  | 'FRIENDSHIP_NOT_FOUND'
  | 'FRIENDSHIP_STATE_CONFLICT';

export class SocialError extends Error {
  constructor(readonly code: SocialErrorCode) {
    super(code);
    this.name = 'SocialError';
  }
}

export interface SocialServiceOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
}

function event(type: SocialEvent['type'], aggregateId: string, payload: Record<string, unknown>, at: Date): SocialEvent {
  return { id: createEventId(), type, aggregateId, occurredAt: at.toISOString(), payload };
}

export class SocialService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly repository: SocialRepository, options: SocialServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => createEventId());
  }

  async requestFriendship(actorId: UserId, targetId: UserId): Promise<FriendshipRecord> {
    this.assertOtherUser(actorId, targetId);
    if (await this.repository.isBlocked(actorId, targetId)) throw new SocialError('RELATIONSHIP_NOT_FOUND');
    const prior = await this.repository.findFriendship(actorId, targetId);
    if (prior?.status === 'pending' && prior.requesterId !== actorId) throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    if (prior?.status === 'pending' || prior?.status === 'accepted') return prior;
    const at = this.now();
    const [userLowId, userHighId] = canonicalUserPair(actorId, targetId);
    const record: FriendshipRecord = {
      id: prior?.id ?? this.createId(),
      userLowId,
      userHighId,
      requesterId: actorId,
      addresseeId: targetId,
      status: 'pending',
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
    };
    return this.repository.writeFriendship({
      record,
      history: this.history(record, prior?.status ?? null, actorId, at),
      event: event('FriendshipRequested', record.id, { friendshipId: record.id, requesterId: actorId, addresseeId: targetId }, at),
    });
  }

  async acceptFriendship(actorId: UserId, friendshipId: string): Promise<FriendshipRecord> {
    const prior = await this.visibleRequest(actorId, friendshipId);
    if (prior.status === 'accepted') return prior;
    if (prior.status !== 'pending') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    const record = { ...prior, status: 'accepted' as const, updatedAt: at };
    return this.repository.writeFriendship({
      record,
      history: this.history(record, prior.status, actorId, at),
      event: event('FriendshipAccepted', record.id, { friendshipId: record.id, requesterId: record.requesterId, addresseeId: record.addresseeId }, at),
    });
  }

  async rejectFriendship(actorId: UserId, friendshipId: string): Promise<FriendshipRecord> {
    const prior = await this.visibleRequest(actorId, friendshipId);
    if (prior.status === 'rejected') return prior;
    if (prior.status !== 'pending') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    const record = { ...prior, status: 'rejected' as const, updatedAt: at };
    return this.repository.writeFriendship({ record, history: this.history(record, prior.status, actorId, at) });
  }

  async removeFriendship(actorId: UserId, targetId: UserId): Promise<void> {
    this.assertOtherUser(actorId, targetId);
    const record = await this.repository.findFriendship(actorId, targetId);
    if (!record) return;
    if (record.status !== 'accepted') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    await this.repository.removeFriendship({
      record,
      event: event('FriendshipRemoved', record.id, { friendshipId: record.id, actorId, targetId }, at),
    });
  }

  async blockUser(actorId: UserId, targetId: UserId): Promise<BlockRecord> {
    this.assertOtherUser(actorId, targetId);
    const existing = await this.repository.findBlock(actorId, targetId);
    if (existing) return existing;
    const at = this.now();
    const removedFriendship = await this.repository.findFriendship(actorId, targetId);
    const record = { blockerId: actorId, blockedId: targetId, createdAt: at };
    return this.repository.writeBlock({
      record,
      event: event('UserBlocked', `${actorId}:${targetId}`, { blockerId: actorId, blockedId: targetId }, at),
      ...(removedFriendship
        ? {
            removedFriendship,
            friendshipRemovedEvent: event('FriendshipRemoved', removedFriendship.id, { friendshipId: removedFriendship.id, actorId, targetId, reason: 'blocked' }, at),
          }
        : {}),
    });
  }

  async unblockUser(actorId: UserId, targetId: UserId): Promise<void> {
    this.assertOtherUser(actorId, targetId);
    const record = await this.repository.findBlock(actorId, targetId);
    if (!record) return;
    const at = this.now();
    await this.repository.removeBlock({
      record,
      event: event('UserUnblocked', `${actorId}:${targetId}`, { blockerId: actorId, blockedId: targetId }, at),
    });
  }

  private history(record: FriendshipRecord, fromStatus: FriendshipHistoryRecord['fromStatus'], actorId: UserId, occurredAt: Date): FriendshipHistoryRecord {
    return { id: this.createId(), friendshipId: record.id, fromStatus, toStatus: record.status, actorId, occurredAt };
  }

  private async visibleRequest(actorId: UserId, friendshipId: string): Promise<FriendshipRecord> {
    const record = await this.repository.findFriendshipById(friendshipId);
    if (!record || record.addresseeId !== actorId) throw new SocialError('FRIENDSHIP_NOT_FOUND');
    if (await this.repository.isBlocked(actorId, record.requesterId)) throw new SocialError('FRIENDSHIP_NOT_FOUND');
    return record;
  }

  private assertOtherUser(actorId: UserId, targetId: UserId): void {
    if (actorId === targetId) throw new SocialError('SELF_RELATIONSHIP');
  }
}
