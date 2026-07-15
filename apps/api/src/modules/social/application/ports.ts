import type { EventId, UserId } from '@bliver/domain';

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendshipRecord {
  readonly id: string;
  readonly userLowId: UserId;
  readonly userHighId: UserId;
  readonly requesterId: UserId;
  readonly addresseeId: UserId;
  readonly status: FriendshipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FriendshipHistoryRecord {
  readonly id: string;
  readonly friendshipId: string;
  readonly fromStatus: FriendshipStatus | null;
  readonly toStatus: FriendshipStatus;
  readonly actorId: UserId;
  readonly occurredAt: Date;
}

export interface BlockRecord {
  readonly blockerId: UserId;
  readonly blockedId: UserId;
  readonly createdAt: Date;
}

export type SocialEventType =
  | 'FriendshipRequested'
  | 'FriendshipAccepted'
  | 'FriendshipRemoved'
  | 'UserBlocked'
  | 'UserUnblocked';

export interface SocialEvent {
  readonly id: EventId;
  readonly type: SocialEventType;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface RelationshipSummaryDto {
  readonly state: 'none' | 'pending-outgoing' | 'pending-incoming' | 'friends' | 'blocked';
  readonly requestId?: string;
}

export interface RelationshipQueryPort {
  areFriends(left: UserId, right: UserId): Promise<boolean>;
  isBlocked(left: UserId, right: UserId): Promise<boolean>;
  getPendingRequest(left: UserId, right: UserId): Promise<FriendshipRecord | null>;
  getRelationshipSummary(actor: UserId, target: UserId): Promise<RelationshipSummaryDto>;
}

export interface SocialCommandIdempotency {
  readonly actorId: UserId;
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
}

export interface SocialIdempotencyRecord {
  readonly fingerprint: string;
  readonly response: unknown;
}

export interface FriendshipWriteInput {
  readonly record: FriendshipRecord;
  readonly history: FriendshipHistoryRecord;
  readonly event?: SocialEvent;
  readonly idempotency?: SocialCommandIdempotency;
}

export interface SocialRepository extends RelationshipQueryPort {
  findFriendship(left: UserId, right: UserId): Promise<FriendshipRecord | null>;
  findFriendshipById(id: string): Promise<FriendshipRecord | null>;
  findBlock(blockerId: UserId, blockedId: UserId): Promise<BlockRecord | null>;
  listFriendships(userId: UserId): Promise<FriendshipRecord[]>;
  listBlocks(blockerId: UserId): Promise<BlockRecord[]>;
  findIdempotency(input: SocialCommandIdempotency): Promise<SocialIdempotencyRecord | null>;
  saveIdempotency(input: SocialCommandIdempotency, response: unknown): Promise<unknown>;
  writeFriendship(input: FriendshipWriteInput): Promise<FriendshipRecord>;
  removeFriendship(input: { readonly record: FriendshipRecord; readonly event: SocialEvent; readonly idempotency?: SocialCommandIdempotency }): Promise<void>;
  writeBlock(input: {
    readonly record: BlockRecord;
    readonly event: SocialEvent;
    readonly removedFriendship?: FriendshipRecord;
    readonly friendshipRemovedEvent?: SocialEvent;
    readonly idempotency?: SocialCommandIdempotency;
  }): Promise<BlockRecord>;
  removeBlock(input: { readonly record: BlockRecord; readonly event: SocialEvent; readonly idempotency?: SocialCommandIdempotency }): Promise<void>;
  listHistory(friendshipId: string): Promise<FriendshipHistoryRecord[]>;
  listEvents(): Promise<SocialEvent[]>;
}

export function canonicalUserPair(left: UserId, right: UserId): readonly [UserId, UserId] {
  return left < right ? [left, right] : [right, left];
}
