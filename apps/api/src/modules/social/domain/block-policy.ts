import type { UserId } from '@bliver/domain';

import type { RelationshipQueryPort } from '../application/ports.js';

export class BlockedResourceNotFoundError extends Error {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor() {
    super('Resource not found');
    this.name = 'BlockedResourceNotFoundError';
  }
}

export interface BlockSqlPredicateInput {
  readonly viewerId: UserId | string | null;
  readonly targetColumn: string;
  readonly addParameter: (value: unknown) => string;
}

export interface RelationshipVisibilitySqlInput {
  readonly actorParameter: string;
  readonly authorColumn: string;
  readonly visibilityColumn: string;
  readonly discoveryExpiresAtColumn: string;
  readonly relationship: 'all' | 'friends' | 'public';
}

export class BlockPolicy {
  constructor(private readonly relationships: Pick<RelationshipQueryPort, 'isBlocked'>) {}

  async canAccess(actorId: UserId, targetId: UserId): Promise<boolean> {
    return actorId === targetId || !(await this.relationships.isBlocked(actorId, targetId));
  }

  async assertAccess(actorId: UserId, targetId: UserId): Promise<void> {
    if (!(await this.canAccess(actorId, targetId))) throw new BlockedResourceNotFoundError();
  }

  excludeBlockedSql(input: BlockSqlPredicateInput): string {
    if (!input.viewerId) return 'TRUE';
    const viewer = input.addParameter(input.viewerId);
    return `NOT EXISTS (SELECT 1 FROM blocks block_policy WHERE (block_policy.blocker_id=${viewer} AND block_policy.blocked_id=${input.targetColumn}) OR (block_policy.blocker_id=${input.targetColumn} AND block_policy.blocked_id=${viewer}))`;
  }

  relationshipVisibilitySql(input: RelationshipVisibilitySqlInput): string {
    const friend = `EXISTS (SELECT 1 FROM friendships social_friendship WHERE social_friendship.user_low_id=LEAST(${input.actorParameter},${input.authorColumn}) AND social_friendship.user_high_id=GREATEST(${input.actorParameter},${input.authorColumn}) AND social_friendship.status='accepted')`;
    const unblocked = `NOT EXISTS (SELECT 1 FROM blocks social_block WHERE (social_block.blocker_id=${input.actorParameter} AND social_block.blocked_id=${input.authorColumn}) OR (social_block.blocker_id=${input.authorColumn} AND social_block.blocked_id=${input.actorParameter}))`;
    const base = `(${input.authorColumn}=${input.actorParameter} OR (${input.visibilityColumn}='public' AND ${input.discoveryExpiresAtColumn}>CURRENT_TIMESTAMP) OR (${input.visibilityColumn}<>'private' AND ${friend}))`;
    const relationship = input.relationship === 'friends' ? friend : input.relationship === 'public' ? `${input.visibilityColumn}='public'` : 'TRUE';
    return `${unblocked} AND ${base} AND ${relationship}`;
  }
}
