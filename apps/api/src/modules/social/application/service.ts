import { createEventId, type UserId } from '@bliver/domain';

import {
  canonicalUserPair,
  type BlockRecord,
  type FriendshipHistoryRecord,
  type FriendshipRecord,
  type SocialCommandIdempotency,
  type SocialEvent,
  type SocialRepository,
} from './ports.js';

export type SocialErrorCode =
  | 'SELF_RELATIONSHIP'
  | 'RELATIONSHIP_NOT_FOUND'
  | 'FRIENDSHIP_NOT_FOUND'
  | 'FRIENDSHIP_STATE_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT';

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

export interface SocialCommandOptions {
  readonly key: string;
  readonly fingerprint: string;
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

  async requestFriendship(actorId: UserId, targetId: UserId, options?: SocialCommandOptions): Promise<FriendshipRecord> {
    const idempotency = this.command(actorId, 'social.friendship.request', options);
    const replay = await this.friendshipReplay(idempotency);
    if (replay) return replay;
    this.assertOtherUser(actorId, targetId);
    if (await this.repository.isBlocked(actorId, targetId)) throw new SocialError('RELATIONSHIP_NOT_FOUND');
    const prior = await this.repository.findFriendship(actorId, targetId);
    if (prior?.status === 'pending' && prior.requesterId !== actorId) throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    if (prior?.status === 'pending' || prior?.status === 'accepted') return this.saveFriendshipReplay(idempotency, prior);
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
      ...(idempotency ? { idempotency } : {}),
    });
  }

  async acceptFriendship(actorId: UserId, friendshipId: string, options?: SocialCommandOptions): Promise<FriendshipRecord> {
    const idempotency = this.command(actorId, 'social.friendship.accept', options);
    const replay = await this.friendshipReplay(idempotency);
    if (replay) return replay;
    const prior = await this.visibleRequest(actorId, friendshipId);
    if (prior.status === 'accepted') return this.saveFriendshipReplay(idempotency, prior);
    if (prior.status !== 'pending') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    const record = { ...prior, status: 'accepted' as const, updatedAt: at };
    return this.repository.writeFriendship({
      record,
      history: this.history(record, prior.status, actorId, at),
      event: event('FriendshipAccepted', record.id, { friendshipId: record.id, requesterId: record.requesterId, addresseeId: record.addresseeId }, at),
      ...(idempotency ? { idempotency } : {}),
    });
  }

  async rejectFriendship(actorId: UserId, friendshipId: string, options?: SocialCommandOptions): Promise<FriendshipRecord> {
    const idempotency = this.command(actorId, 'social.friendship.reject', options);
    const replay = await this.friendshipReplay(idempotency);
    if (replay) return replay;
    const prior = await this.visibleRequest(actorId, friendshipId);
    if (prior.status === 'rejected') return this.saveFriendshipReplay(idempotency, prior);
    if (prior.status !== 'pending') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    const record = { ...prior, status: 'rejected' as const, updatedAt: at };
    return this.repository.writeFriendship({ record, history: this.history(record, prior.status, actorId, at), ...(idempotency ? { idempotency } : {}) });
  }

  async removeFriendship(actorId: UserId, targetId: UserId, options?: SocialCommandOptions): Promise<void> {
    const idempotency = this.command(actorId, 'social.friendship.remove', options);
    if (await this.voidReplay(idempotency)) return;
    this.assertOtherUser(actorId, targetId);
    const record = await this.repository.findFriendship(actorId, targetId);
    if (!record) { await this.saveVoidReplay(idempotency); return; }
    if (record.status !== 'accepted') throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
    const at = this.now();
    await this.repository.removeFriendship({
      record,
      event: event('FriendshipRemoved', record.id, { friendshipId: record.id, actorId, targetId }, at),
      ...(idempotency ? { idempotency } : {}),
    });
  }

  async blockUser(actorId: UserId, targetId: UserId, options?: SocialCommandOptions): Promise<BlockRecord> {
    const idempotency = this.command(actorId, 'social.block', options);
    const replay = await this.blockReplay(idempotency);
    if (replay) return replay;
    this.assertOtherUser(actorId, targetId);
    const existing = await this.repository.findBlock(actorId, targetId);
    if (existing) return this.saveBlockReplay(idempotency, existing);
    const at = this.now();
    const removedFriendship = await this.repository.findFriendship(actorId, targetId);
    const record = { blockerId: actorId, blockedId: targetId, createdAt: at };
    return this.repository.writeBlock({
      record,
      event: event('UserBlocked', `${actorId}:${targetId}`, { blockerId: actorId, blockedId: targetId }, at),
      ...(idempotency ? { idempotency } : {}),
      ...(removedFriendship
        ? {
            removedFriendship,
            friendshipRemovedEvent: event('FriendshipRemoved', removedFriendship.id, { friendshipId: removedFriendship.id, actorId, targetId, reason: 'blocked' }, at),
          }
        : {}),
    });
  }

  async unblockUser(actorId: UserId, targetId: UserId, options?: SocialCommandOptions): Promise<void> {
    const idempotency = this.command(actorId, 'social.unblock', options);
    if (await this.voidReplay(idempotency)) return;
    this.assertOtherUser(actorId, targetId);
    const record = await this.repository.findBlock(actorId, targetId);
    if (!record) { await this.saveVoidReplay(idempotency); return; }
    const at = this.now();
    await this.repository.removeBlock({
      record,
      event: event('UserUnblocked', `${actorId}:${targetId}`, { blockerId: actorId, blockedId: targetId }, at),
      ...(idempotency ? { idempotency } : {}),
    });
  }

  async listFriendships(actorId: UserId): Promise<FriendshipRecord[]> {
    return (await this.repository.listFriendships(actorId)).filter((record) => record.status === 'accepted');
  }

  async listRequests(actorId: UserId): Promise<FriendshipRecord[]> {
    return (await this.repository.listFriendships(actorId)).filter((record) => record.status === 'pending');
  }

  async listBlocks(actorId: UserId): Promise<BlockRecord[]> {
    return this.repository.listBlocks(actorId);
  }

  async getRelationshipSummary(actorId: UserId, targetId: UserId) {
    this.assertOtherUser(actorId, targetId);
    return this.repository.getRelationshipSummary(actorId, targetId);
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

  private command(actorId: UserId, scope: string, options?: SocialCommandOptions): SocialCommandIdempotency | undefined {
    if (!options) return undefined;
    return { actorId, scope, key: options.key, fingerprint: options.fingerprint };
  }

  private async replay(idempotency?: SocialCommandIdempotency): Promise<unknown | null> {
    if (!idempotency) return null;
    const stored = await this.repository.findIdempotency(idempotency);
    if (!stored) return null;
    if (stored.fingerprint !== idempotency.fingerprint) throw new SocialError('IDEMPOTENCY_CONFLICT');
    return stored.response;
  }

  private async friendshipReplay(idempotency?: SocialCommandIdempotency): Promise<FriendshipRecord | null> {
    const value = await this.replay(idempotency);
    return value ? this.toFriendship(value) : null;
  }

  private async blockReplay(idempotency?: SocialCommandIdempotency): Promise<BlockRecord | null> {
    const value = await this.replay(idempotency);
    if (!value) return null;
    const record = value as Record<string, unknown>;
    return { blockerId: record.blockerId as UserId, blockedId: record.blockedId as UserId, createdAt: new Date(String(record.createdAt)) };
  }

  private async voidReplay(idempotency?: SocialCommandIdempotency): Promise<boolean> {
    return (await this.replay(idempotency)) !== null;
  }

  private async saveFriendshipReplay(idempotency: SocialCommandIdempotency | undefined, record: FriendshipRecord): Promise<FriendshipRecord> {
    if (!idempotency) return record;
    return this.toFriendship(await this.repository.saveIdempotency(idempotency, record));
  }

  private async saveBlockReplay(idempotency: SocialCommandIdempotency | undefined, record: BlockRecord): Promise<BlockRecord> {
    if (!idempotency) return record;
    const stored = await this.repository.saveIdempotency(idempotency, record) as Record<string, unknown>;
    return { blockerId: stored.blockerId as UserId, blockedId: stored.blockedId as UserId, createdAt: new Date(String(stored.createdAt)) };
  }

  private async saveVoidReplay(idempotency?: SocialCommandIdempotency): Promise<void> {
    if (idempotency) await this.repository.saveIdempotency(idempotency, { removed: true });
  }

  private toFriendship(value: unknown): FriendshipRecord {
    const record = value as FriendshipRecord;
    return { ...record, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) };
  }
}
